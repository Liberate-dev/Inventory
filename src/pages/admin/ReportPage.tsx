import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Download, FileText, History, Layers3, Package, Trash2, TrendingUp, AlertTriangle, Wrench } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import type { ComponentCondition, ItemLog } from '../../types';
import { getAuthHeaders } from '../../utils/api';
import { buildDeletionHistoryRows, getConditionLabel } from '../../utils/itemHistory';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type LogStatus = 'good' | 'bad';

type FlatItemRow = {
    id: string;
    sku: string;
    name: string;
    quantity: number;
    unit: string;
    minStock: number;
    isLowStock: boolean;
    condition: ComponentCondition;
    category: string;
    location: string;
    roomName: string;
    isConsumable: boolean;
    latestAction: string;
    latestDate: string;
};

type MonthlyLogRow = {
    id: string;
    date: string;
    roomName: string;
    item: string;
    action: string;
    status: LogStatus;
    details: Record<string, unknown>;
};

type MaintenanceRow = {
    id: string;
    date: string;
    roomName: string;
    item: string;
    action: string;
    maintenanceStatus: string;
    detailsText: string;
    isIssue: boolean;
};

type ReportSectionKey = 'inventory' | 'mutation' | 'deletion' | 'maintenance' | 'category' | 'room';

type ItemHistorySource = {
    id: string;
    sku?: string;
    name: string;
    condition: ComponentCondition;
    room_id?: string;
    room_name?: string;
    created_at?: string;
    deleted_at?: string | null;
    logs?: ItemLog[];
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/public/api').replace(/\/+$/, '');
const ITEMS_API_ENDPOINT = `${API_BASE_URL}/inventory/items_management.php`;

const parseDetails = (raw: unknown): Record<string, unknown> => {
    if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return {};
};

const normalizeActionLabel = (action: string): string => {
    const cleaned = action.replace(/_/g, ' ').toLowerCase();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const conditionLabel = (condition: ComponentCondition): string => {
    if (condition === 'service') return 'Perlu perbaikan';
    if (condition === 'damaged') return 'Rusak ringan';
    if (condition === 'broken') return 'Rusak berat';
    return getConditionLabel(condition);
};

const getLogStatus = (action: string, details: Record<string, unknown>): LogStatus => {
    if (action === 'MAINTENANCE_COMPLETED') {
        const outcome = String(details.outcome ?? details.conditionAfter ?? details.condition ?? '').toLowerCase();
        return outcome === 'broken' ? 'bad' : 'good';
    }
    return 'good';
};

const isStockInAction = (action: string): boolean => {
    const value = action.toLowerCase();
    return value.includes('create') || value.includes('add') || value.includes('new') || value.includes('stock_in') || value.includes('purchase') || value.includes('donation') || value.includes('hibah');
};

const isOutgoingAction = (action: string): boolean => {
    const value = action.toUpperCase();
    return value === 'CHECK_OUT' || value === 'RETURNED' || value.includes('DELETE') || value.includes('REMOVE') || value.includes('DISPOSE');
};

const mutationDescription = (log: MonthlyLogRow): string => {
    const details = log.details;
    if (log.action === 'TRANSFER') return `Dari ${String(details.from ?? '-')} ke ${String(details.to ?? '-')}`;
    if (log.action === 'CHECK_OUT') return `Dipinjam oleh ${String(details.borrower ?? '-')}`;
    if (log.action === 'RETURNED') return `Dikembalikan oleh ${String(details.returner ?? details.borrower ?? '-')}`;
    return normalizeActionLabel(log.action);
};

const maintenanceStatus = (log: MonthlyLogRow): { label: string; isIssue: boolean } => {
    if (log.action === 'MAINTENANCE_REQUESTED') return { label: 'Menunggu perbaikan', isIssue: false };
    if (log.action === 'MAINTENANCE_ACCEPTED') return { label: 'Sedang diproses', isIssue: false };
    if (log.action === 'MAINTENANCE_DENIED') return { label: 'Ditolak', isIssue: false };
    if (log.action === 'MAINTENANCE_COMPLETED') {
        const outcome = String(log.details.outcome ?? log.details.conditionAfter ?? log.details.condition ?? '').toLowerCase();
        if (outcome === 'broken') return { label: 'Tidak dapat diperbaiki', isIssue: true };
        return { label: 'Sudah diperbaiki', isIssue: false };
    }
    return { label: normalizeActionLabel(log.action), isIssue: false };
};

const maintenanceDetailsText = (log: MonthlyLogRow): string => {
    if (log.action === 'MAINTENANCE_REQUESTED') {
        return String(log.details.description ?? log.details.note ?? '-');
    }
    if (log.action === 'MAINTENANCE_ACCEPTED') {
        return String(log.details.note ?? '-');
    }
    if (log.action === 'MAINTENANCE_DENIED') {
        return String(log.details.reason ?? log.details.note ?? '-');
    }
    if (log.action === 'MAINTENANCE_COMPLETED') {
        const outcome = String(log.details.outcome ?? log.details.conditionAfter ?? '-');
        const note = String(log.details.note ?? '').trim();
        return note !== '' ? `${outcome} - ${note}` : outcome;
    }
    return '-';
};

const getLatestLog = (logs: ItemLog[]): ItemLog | undefined => {
    if (!Array.isArray(logs) || logs.length === 0) return undefined;
    return [...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
};

const reportSections: {
    key: ReportSectionKey;
    title: string;
    description: string;
    icon: typeof Package;
}[] = [
    {
        key: 'inventory',
        title: 'Data Inventaris Barang',
        description: 'Lihat aset tetap dan aset habis pakai beserta kondisi serta lokasinya.',
        icon: Package
    },
    {
        key: 'mutation',
        title: 'Mutasi Barang',
        description: 'Tampilkan barang masuk, barang keluar, dan perpindahan barang.',
        icon: TrendingUp
    },
    {
        key: 'deletion',
        title: 'Penghapusan Barang',
        description: 'Lihat riwayat barang yang dihapus pada periode terpilih.',
        icon: Trash2
    },
    {
        key: 'maintenance',
        title: 'Kondisi & Pemeliharaan',
        description: 'Pantau maintenance bulanan dan barang yang perlu perbaikan.',
        icon: Wrench
    },
    {
        key: 'category',
        title: 'Rekap per Kategori',
        description: 'Ringkasan jumlah item, kuantitas, dan kondisi per kategori.',
        icon: Layers3
    },
    {
        key: 'room',
        title: 'Rekap per Ruangan',
        description: 'Ringkasan inventaris dan kondisi barang per ruangan.',
        icon: Building2
    }
];

const reportSectionTitleMap: Record<ReportSectionKey, string> = {
    inventory: 'Data Inventaris Barang',
    mutation: 'Mutasi Barang',
    deletion: 'Penghapusan Barang',
    maintenance: 'Kondisi & Pemeliharaan',
    category: 'Rekap per Kategori',
    room: 'Rekap per Ruangan'
};

const ReportPage = () => {
    const navigate = useNavigate();
    const { rooms } = useInventory();
    const { user } = useAuth();
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
    const [selectedReportView, setSelectedReportView] = useState<ReportSectionKey | 'all' | null>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyItems, setHistoryItems] = useState<ItemHistorySource[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const visibleRooms = useMemo(() => {
        if (!user) return rooms;
        const isScopeRestricted =
            Boolean(user.labScope)
            && user.labScope !== 'all';

        return isScopeRestricted
            ? rooms.filter((room) => room.type === user.labScope)
            : rooms;
    }, [rooms, user]);

    useEffect(() => {
        let cancelled = false;

        const fetchItemHistory = async () => {
            setHistoryLoading(true);
            setHistoryError(null);
            try {
                const response = await fetch(ITEMS_API_ENDPOINT, {
                    headers: getAuthHeaders()
                });
                const payload = await response.json() as { status?: string; message?: string; items?: ItemHistorySource[] };
                if (!response.ok || payload.status !== 'success') {
                    throw new Error(payload.message || 'Gagal memuat riwayat penghapusan.');
                }
                if (!cancelled) {
                    setHistoryItems(Array.isArray(payload.items) ? payload.items : []);
                }
            } catch (error) {
                if (!cancelled) {
                    setHistoryError(error instanceof Error ? error.message : 'Gagal memuat riwayat penghapusan.');
                }
            } finally {
                if (!cancelled) {
                    setHistoryLoading(false);
                }
            }
        };

        void fetchItemHistory();

        return () => {
            cancelled = true;
        };
    }, [user?.id]);

    const handlePrint = () => {
        window.print();
    };

    const deletionHistoryRows = useMemo(
        () => buildDeletionHistoryRows(historyItems, {
            selectedMonth,
            visibleRoomIds: visibleRooms.map((room) => room.id)
        }),
        [historyItems, selectedMonth, visibleRooms]
    );

    const reportHistorySummary = useMemo(() => {
        const monthMap = new Map<string, {
            key: string;
            label: string;
            totalLogs: number;
            mutations: number;
            maintenance: number;
            deletions: number;
        }>();

        const ensureEntry = (rawDate: string) => {
            const key = rawDate.slice(0, 7);
            if (!/^\d{4}-\d{2}$/.test(key)) return null;
            if (!monthMap.has(key)) {
                const date = new Date(`${key}-01T00:00:00`);
                monthMap.set(key, {
                    key,
                    label: date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
                    totalLogs: 0,
                    mutations: 0,
                    maintenance: 0,
                    deletions: 0
                });
            }
            return monthMap.get(key)!;
        };

        visibleRooms.forEach((room) => {
            room.containers.forEach((container) => {
                container.items.forEach((item) => {
                    item.logs?.forEach((log) => {
                        const entry = ensureEntry(log.date);
                        if (!entry) return;
                        entry.totalLogs += 1;
                        if (isStockInAction(log.action) || isOutgoingAction(log.action) || log.action === 'TRANSFER') {
                            entry.mutations += 1;
                        }
                        if (log.action.startsWith('MAINTENANCE_')) {
                            entry.maintenance += 1;
                        }
                    });
                });
            });
        });

        const visibleRoomIds = new Set(visibleRooms.map((room) => room.id));
        historyItems.forEach((item) => {
            const roomId = typeof item.room_id === 'string' ? item.room_id : undefined;
            if (roomId && !visibleRoomIds.has(roomId)) return;
            const deletionDate = typeof item.deleted_at === 'string'
                ? item.deleted_at
                : item.logs?.find((log) => /delete|remove|dispose/i.test(log.action))?.date;
            if (!deletionDate) return;
            const entry = ensureEntry(deletionDate);
            if (!entry) return;
            entry.deletions += 1;
        });

        return [...monthMap.values()].sort((a, b) => b.key.localeCompare(a.key));
    }, [historyItems, visibleRooms]);

    const showAllReports = selectedReportView === 'all';
    const hasActiveReportSelection = selectedReportView !== null;
    const shouldShowReportSection = (sectionKey: ReportSectionKey) =>
        showAllReports || selectedReportView === sectionKey;

    const {
        fixedAssets,
        consumableAssets,
        monthlyLogs,
        maintenanceRows,
        needsRepairItems,
        stats,
        categorySummary,
        roomSummary
    } = useMemo(() => {
        const flatItems: FlatItemRow[] = [];
        const logs: MonthlyLogRow[] = [];
        let stockInCount = 0;

        visibleRooms.forEach((room) => {
            room.containers.forEach((container) => {
                container.items.forEach((item) => {
                    const latest = getLatestLog(item.logs ?? []);
                    flatItems.push({
                        id: item.id,
                        sku: item.sku?.trim() ? item.sku : '-',
                        name: item.name,
                        quantity: item.quantity ?? 1,
                        unit: item.unit ?? 'Pcs',
                        minStock: item.minStock ?? 0,
                        isLowStock: Boolean(item.isConsumable) && (item.quantity ?? 0) <= (item.minStock ?? 0),
                        condition: item.condition,
                        category: (item.category?.trim() || item.type || 'Lainnya').trim(),
                        location: `${room.name} / ${container.name}`,
                        roomName: room.name,
                        isConsumable: Boolean(item.isConsumable),
                        latestAction: latest ? normalizeActionLabel(latest.action) : '-',
                        latestDate: latest?.date ?? ''
                    });

                    item.logs?.forEach((log) => {
                        if (!log.date.startsWith(selectedMonth)) return;
                        const details = parseDetails(log.details);
                        const status = getLogStatus(log.action, details);
                        logs.push({
                            id: log.id,
                            date: log.date,
                            roomName: room.name,
                            item: item.name,
                            action: log.action,
                            status,
                            details
                        });
                        if (isStockInAction(log.action)) stockInCount++;
                    });
                });
            });
        });

        const sortedLogs = logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const fixed = flatItems.filter((item) => !item.isConsumable);
        const consumables = flatItems.filter((item) => item.isConsumable);

        const maintenanceLogs = sortedLogs.filter((log) => log.action.startsWith('MAINTENANCE_'));
        const mappedMaintenanceRows: MaintenanceRow[] = maintenanceLogs.map((log) => {
            const statusInfo = maintenanceStatus(log);
            return {
                id: log.id,
                date: log.date,
                roomName: log.roomName,
                item: log.item,
                action: normalizeActionLabel(log.action),
                maintenanceStatus: statusInfo.label,
                detailsText: maintenanceDetailsText(log),
                isIssue: statusInfo.isIssue
            };
        });

        const needsRepair = flatItems.filter((item) => item.condition === 'service' || item.condition === 'damaged' || item.condition === 'broken');

        const categoryMap = new Map<string, { category: string; itemCount: number; totalQty: number; good: number; service: number; damaged: number; broken: number }>();
        flatItems.forEach((item) => {
            const key = item.category;
            if (!categoryMap.has(key)) {
                categoryMap.set(key, { category: key, itemCount: 0, totalQty: 0, good: 0, service: 0, damaged: 0, broken: 0 });
            }
            const entry = categoryMap.get(key)!;
            entry.itemCount += 1;
            entry.totalQty += item.quantity;
            entry[item.condition] += 1;
        });

        const roomMap = new Map<string, { roomName: string; itemCount: number; totalQty: number; good: number; service: number; damaged: number; broken: number }>();
        flatItems.forEach((item) => {
            const key = item.roomName;
            if (!roomMap.has(key)) {
                roomMap.set(key, { roomName: key, itemCount: 0, totalQty: 0, good: 0, service: 0, damaged: 0, broken: 0 });
            }
            const entry = roomMap.get(key)!;
            entry.itemCount += 1;
            entry.totalQty += item.quantity;
            entry[item.condition] += 1;
        });

        return {
            fixedAssets: fixed.sort((a, b) => a.name.localeCompare(b.name)),
            consumableAssets: consumables.sort((a, b) => a.name.localeCompare(b.name)),
            monthlyLogs: sortedLogs,
            maintenanceRows: mappedMaintenanceRows,
            needsRepairItems: needsRepair.sort((a, b) => a.name.localeCompare(b.name)),
            categorySummary: [...categoryMap.values()].sort((a, b) => b.totalQty - a.totalQty),
            roomSummary: [...roomMap.values()].sort((a, b) => b.totalQty - a.totalQty),
            stats: {
                totalActions: sortedLogs.length,
                stockIn: stockInCount,
                outgoing: sortedLogs.filter((log) => isOutgoingAction(log.action)).length,
                transfers: sortedLogs.filter((log) => log.action === 'TRANSFER').length,
                maintenanceIssue: mappedMaintenanceRows.filter((row) => row.isIssue).length,
                needRepair: needsRepair.length
            }
        };
    }, [visibleRooms, selectedMonth]);

    const mutationLogs = useMemo(
        () => monthlyLogs.filter((log) => isStockInAction(log.action) || isOutgoingAction(log.action) || log.action === 'TRANSFER'),
        [monthlyLogs]
    );

    const activeSectionKeys = useMemo<ReportSectionKey[]>(() => {
        if (selectedReportView === 'all') return reportSections.map((section) => section.key);
        if (selectedReportView) return [selectedReportView];
        return [];
    }, [selectedReportView]);

    const handleExportPdf = () => {
        if (!hasActiveReportSelection) return;

        const doc = new jsPDF('landscape', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const now = new Date();
        const reportLabel = selectedReportView === 'all'
            ? 'Semua Laporan'
            : reportSectionTitleMap[selectedReportView as ReportSectionKey];

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('LAPORAN BULANAN INVENTORY', pageWidth / 2, 18, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Periode ${new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} • ${reportLabel}`, pageWidth / 2, 25, { align: 'center' });
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`Dicetak: ${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, 31, { align: 'center' });
        doc.setTextColor(0);
        doc.setDrawColor(0, 0, 128);
        doc.setLineWidth(0.5);
        doc.line(14, 34, pageWidth - 14, 34);

        let currentY = 40;

        autoTable(doc, {
            startY: currentY,
            head: [['Total Log', 'Barang Masuk', 'Barang Keluar', 'Transfer', 'Perlu Perbaikan', 'Issue']],
            body: [[
                String(stats.totalActions),
                String(stats.stockIn),
                String(stats.outgoing),
                String(stats.transfers),
                String(stats.needRepair),
                String(stats.maintenanceIssue)
            ]],
            styles: { fontSize: 9, cellPadding: 3, halign: 'center' },
            headStyles: { fillColor: [0, 0, 128], textColor: 255, fontStyle: 'bold' },
            margin: { left: 14, right: 14 }
        });
        currentY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 54;

        const ensureSpace = (estimatedHeight = 50) => {
            if (currentY + estimatedHeight <= pageHeight - 20) return;
            doc.addPage();
            currentY = 18;
        };

        const addSectionTitle = (title: string) => {
            ensureSpace(18);
            currentY += 8;
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(title, 14, currentY);
            currentY += 2;
        };

        const addTable = (head: string[], body: string[][], emptyMessage: string) => {
            ensureSpace(40);
            if (body.length === 0) {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'italic');
                currentY += 6;
                doc.text(emptyMessage, 14, currentY);
                currentY += 8;
                return;
            }

            autoTable(doc, {
                startY: currentY + 4,
                head: [head],
                body,
                styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
                headStyles: { fillColor: [0, 0, 128], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 247, 250] },
                margin: { left: 14, right: 14 }
            });
            currentY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? currentY) + 6;
        };

        activeSectionKeys.forEach((sectionKey) => {
            if (sectionKey === 'inventory') {
                addSectionTitle('1. Data Inventaris Barang - Aset Tetap');
                addTable(
                    ['Kode', 'Nama', 'Jumlah', 'Kondisi', 'Lokasi'],
                    fixedAssets.map((item) => [item.sku, item.name, `${item.quantity} ${item.unit}`, conditionLabel(item.condition), item.location]),
                    'Tidak ada aset tetap.'
                );
                addSectionTitle('1. Data Inventaris Barang - Aset Habis Pakai');
                addTable(
                    ['Kode', 'Nama', 'Stok', 'Stok Minimum', 'Status', 'Lokasi'],
                    consumableAssets.map((item) => [item.sku, item.name, `${item.quantity} ${item.unit}`, `${item.minStock} ${item.unit}`, item.isLowStock ? 'Rawan' : 'Aman', item.location]),
                    'Tidak ada aset habis pakai.'
                );
            }

            if (sectionKey === 'mutation') {
                addSectionTitle('2. Mutasi Barang');
                addTable(
                    ['Tanggal', 'Ruangan', 'Barang', 'Aksi', 'Keterangan'],
                    mutationLogs.map((log) => [new Date(log.date).toLocaleString('id-ID'), log.roomName, log.item, normalizeActionLabel(log.action), mutationDescription(log)]),
                    'Tidak ada mutasi barang pada periode ini.'
                );
            }

            if (sectionKey === 'deletion') {
                addSectionTitle('3. Penghapusan Barang');
                addTable(
                    ['No', 'No Inventaris', 'Tanggal Pengadaan', 'Tanggal Penghapusan', 'Keterangan Kondisi'],
                    deletionHistoryRows.map((row, index) => [
                        String(index + 1),
                        row.sku,
                        row.procurementDate === '-' ? '-' : new Date(row.procurementDate).toLocaleDateString('id-ID'),
                        new Date(row.deletionDate).toLocaleDateString('id-ID'),
                        row.conditionText
                    ]),
                    'Tidak ada riwayat penghapusan pada periode ini.'
                );
            }

            if (sectionKey === 'maintenance') {
                addSectionTitle('4. Kondisi & Pemeliharaan - Log Maintenance');
                addTable(
                    ['Tanggal', 'Ruangan', 'Barang', 'Aksi', 'Status', 'Keterangan'],
                    maintenanceRows.map((row) => [new Date(row.date).toLocaleString('id-ID'), row.roomName, row.item, row.action, row.maintenanceStatus, row.detailsText]),
                    'Tidak ada aktivitas maintenance pada periode ini.'
                );
                addSectionTitle('4. Kondisi & Pemeliharaan - Barang Perlu Perbaikan');
                addTable(
                    ['Barang', 'Kondisi', 'Lokasi', 'Aksi Terakhir'],
                    needsRepairItems.map((item) => [item.name, conditionLabel(item.condition), item.location, item.latestAction]),
                    'Tidak ada barang yang perlu perbaikan saat ini.'
                );
            }

            if (sectionKey === 'category') {
                addSectionTitle('5. Rekap per Kategori');
                addTable(
                    ['Kategori', 'Jumlah Item', 'Total Qty', 'Baik', 'Perlu Perbaikan', 'Rusak Ringan', 'Rusak Berat'],
                    categorySummary.map((row) => [row.category, String(row.itemCount), String(row.totalQty), String(row.good), String(row.service), String(row.damaged), String(row.broken)]),
                    'Belum ada data kategori.'
                );
            }

            if (sectionKey === 'room') {
                addSectionTitle('6. Rekap per Ruangan');
                addTable(
                    ['Ruangan', 'Jumlah Item', 'Total Qty', 'Baik', 'Perlu Perbaikan', 'Rusak Ringan', 'Rusak Berat'],
                    roomSummary.map((row) => [row.roomName, String(row.itemCount), String(row.totalQty), String(row.good), String(row.service), String(row.damaged), String(row.broken)]),
                    'Belum ada data ruangan.'
                );
            }
        });

        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
            doc.text('Portal Inventory — SMPK Santa Maria 2 Malang', 14, pageHeight - 8);
        }

        doc.save(`Laporan_Bulanan_${selectedMonth}_${selectedReportView ?? 'none'}.pdf`);
    };

    return (
        <div className="h-full flex flex-col bg-white border border-slate-200 rounded-2xl shadow-md shadow-blue-900/5 overflow-hidden print:border-none print:shadow-none">
            <div className="p-8 space-y-8 max-w-7xl mx-auto w-full overflow-y-auto">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-extrabold text-[#000080] tracking-tight">Monthly Report</h2>
                        <p className="text-slate-500">Periode: {new Date(selectedMonth).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div className="flex gap-3 print:hidden">
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="border border-slate-200 rounded-xl px-4 py-2 bg-white outline-none hover:bg-slate-50 font-semibold text-slate-700 inline-flex items-center gap-2"
                        >
                            <ArrowLeft size={16} /> Back to Dashboard
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsHistoryModalOpen(true)}
                            className="border border-slate-200 rounded-xl px-4 py-2 bg-white outline-none hover:bg-slate-50 font-semibold text-slate-700 inline-flex items-center gap-2"
                        >
                            <History size={16} /> History
                        </button>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="border border-slate-200 rounded-xl px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-[#000080]"
                        />
                        <button
                            type="button"
                            onClick={handleExportPdf}
                            disabled={!hasActiveReportSelection}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-md transition-all"
                        >
                            <Download size={18} /> Export
                        </button>
                        <button
                            onClick={handlePrint}
                            disabled={!hasActiveReportSelection}
                            className="bg-[#000080] hover:bg-[#000060] disabled:hover:bg-[#000080] disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-md shadow-blue-900/10 transition-all"
                        >
                            <Download size={20} /> Print Report
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 print:grid-cols-3">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <div className="flex items-center gap-2 text-blue-700 text-sm font-bold"><FileText size={16} /> Total Log</div>
                        <div className="text-2xl font-bold text-blue-900 mt-1">{stats.totalActions}</div>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <div className="flex items-center gap-2 text-emerald-700 text-sm font-bold"><TrendingUp size={16} /> Barang Masuk</div>
                        <div className="text-2xl font-bold text-emerald-900 mt-1">{stats.stockIn}</div>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
                        <div className="flex items-center gap-2 text-amber-700 text-sm font-bold"><TrendingUp size={16} /> Barang Keluar</div>
                        <div className="text-2xl font-bold text-amber-900 mt-1">{stats.outgoing}</div>
                    </div>
                    <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <div className="flex items-center gap-2 text-indigo-700 text-sm font-bold"><TrendingUp size={16} /> Transfer</div>
                        <div className="text-2xl font-bold text-indigo-900 mt-1">{stats.transfers}</div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                        <div className="flex items-center gap-2 text-orange-700 text-sm font-bold"><Wrench size={16} /> Perlu Perbaikan</div>
                        <div className="text-2xl font-bold text-orange-900 mt-1">{stats.needRepair}</div>
                    </div>
                    <div className="bg-rose-50 p-4 rounded-xl border border-rose-100">
                        <div className="flex items-center gap-2 text-rose-700 text-sm font-bold"><AlertTriangle size={16} /> Issue</div>
                        <div className="text-2xl font-bold text-rose-900 mt-1">{stats.maintenanceIssue}</div>
                    </div>
                </div>

                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">Pilih Tampilan Laporan</h3>
                        <p className="text-sm text-slate-500">Setelah membuka laporan bulanan, pilih jenis data yang ingin dilihat atau gunakan View All untuk tampilan lengkap.</p>
                    </div>
                    <div className="p-5 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {reportSections.map((section) => {
                                const Icon = section.icon;
                                const isSelected = selectedReportView === section.key;

                                return (
                                    <button
                                        key={section.key}
                                        type="button"
                                        onClick={() => setSelectedReportView(section.key)}
                                        className={`text-left rounded-2xl border p-5 transition-all ${isSelected
                                            ? 'border-[#000080] bg-blue-50 shadow-sm shadow-blue-900/10'
                                            : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={`rounded-xl p-3 ${isSelected ? 'bg-[#000080] text-white' : 'bg-slate-100 text-slate-600'}`}>
                                                <Icon size={20} />
                                            </div>
                                            <div className="space-y-1">
                                                <h4 className="font-bold text-slate-900">{section.title}</h4>
                                                <p className="text-sm text-slate-500">{section.description}</p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => setSelectedReportView('all')}
                                className={`rounded-xl px-4 py-2 font-semibold transition-colors ${showAllReports
                                    ? 'bg-[#000080] text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                            >
                                View All
                            </button>
                            {hasActiveReportSelection && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedReportView(null)}
                                    className="rounded-xl px-4 py-2 font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    Reset Pilihan
                                </button>
                            )}
                        </div>

                        {!hasActiveReportSelection && (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                                Belum ada jenis laporan yang dipilih. Pilih salah satu laporan di atas atau klik <span className="font-semibold">View All</span>.
                            </div>
                        )}
                    </div>
                </section>

                {isHistoryModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden">
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-slate-200 flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">History Laporan Bulanan</h3>
                                    <p className="text-sm text-slate-500">Pilih periode yang tersedia untuk langsung membuka laporannya.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsHistoryModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                                >
                                    Tutup
                                </button>
                            </div>

                            <div className="p-6 space-y-6 overflow-y-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {reportHistorySummary.map((entry) => (
                                        <button
                                            key={entry.key}
                                            type="button"
                                            onClick={() => {
                                                setSelectedMonth(entry.key);
                                                setIsHistoryModalOpen(false);
                                            }}
                                            className="text-left rounded-2xl border border-slate-200 bg-slate-50 p-5 hover:bg-slate-100 transition-colors"
                                        >
                                            <p className="text-sm font-bold text-slate-900">{entry.label}</p>
                                            <p className="text-2xl font-extrabold text-[#000080] mt-1">{entry.totalLogs}</p>
                                            <div className="mt-3 text-xs text-slate-500 space-y-1">
                                                <div>Total log: {entry.totalLogs}</div>
                                                <div>Mutasi: {entry.mutations}</div>
                                                <div>Maintenance: {entry.maintenance}</div>
                                                <div>Penghapusan: {entry.deletions}</div>
                                            </div>
                                        </button>
                                    ))}
                                    {reportHistorySummary.length === 0 && (
                                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                                            Belum ada history laporan yang bisa ditampilkan.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {shouldShowReportSection('inventory') && (
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">1. Data Inventaris Barang</h3>
                        <p className="text-sm text-slate-500">Aset tetap, aset habis pakai, kode barang, jumlah, kondisi, dan lokasi penempatan.</p>
                    </div>
                    <div className="p-5 space-y-6">
                        <div>
                            <h4 className="font-bold text-slate-800 mb-2">Aset Tetap</h4>
                            <table className="w-full text-sm">
                                <thead className="text-slate-500 bg-slate-50">
                                    <tr>
                                        <th className="text-left p-2">Kode</th>
                                        <th className="text-left p-2">Nama</th>
                                        <th className="text-left p-2">Jumlah</th>
                                        <th className="text-left p-2">Kondisi</th>
                                        <th className="text-left p-2">Lokasi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {fixedAssets.slice(0, 20).map((item) => (
                                        <tr key={`fixed-${item.id}`}>
                                            <td className="p-2">{item.sku}</td>
                                            <td className="p-2 font-semibold">{item.name}</td>
                                            <td className="p-2">{item.quantity} {item.unit}</td>
                                            <td className="p-2">{conditionLabel(item.condition)}</td>
                                            <td className="p-2">{item.location}</td>
                                        </tr>
                                    ))}
                                    {fixedAssets.length === 0 && (
                                        <tr><td className="p-3 text-slate-500" colSpan={5}>Tidak ada aset tetap.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800 mb-2">Aset Habis Pakai</h4>
                            <table className="w-full text-sm">
                                <thead className="text-slate-500 bg-slate-50">
                                    <tr>
                                        <th className="text-left p-2">Kode</th>
                                        <th className="text-left p-2">Nama</th>
                                        <th className="text-left p-2">Stok</th>
                                        <th className="text-left p-2">Stok Minimum</th>
                                        <th className="text-left p-2">Status Stok</th>
                                        <th className="text-left p-2">Lokasi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {consumableAssets.slice(0, 20).map((item) => (
                                        <tr key={`consumable-${item.id}`}>
                                            <td className="p-2">{item.sku}</td>
                                            <td className="p-2 font-semibold">{item.name}</td>
                                            <td className="p-2">{item.quantity} {item.unit}</td>
                                            <td className="p-2">{item.minStock} {item.unit}</td>
                                            <td className="p-2">
                                                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-bold ${item.isLowStock ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {item.isLowStock ? 'Rawan' : 'Aman'}
                                                </span>
                                            </td>
                                            <td className="p-2">{item.location}</td>
                                        </tr>
                                    ))}
                                    {consumableAssets.length === 0 && (
                                        <tr><td className="p-3 text-slate-500" colSpan={6}>Tidak ada aset habis pakai.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
                )}

                {shouldShowReportSection('mutation') && (
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">2. Mutasi Barang</h3>
                        <p className="text-sm text-slate-500">Barang masuk, barang keluar, dan perpindahan antar ruangan.</p>
                    </div>
                    <div className="p-5">
                        <table className="w-full text-sm">
                            <thead className="text-slate-500 bg-slate-50">
                                <tr>
                                    <th className="text-left p-2">Tanggal</th>
                                    <th className="text-left p-2">Ruangan</th>
                                    <th className="text-left p-2">Barang</th>
                                    <th className="text-left p-2">Aksi</th>
                                    <th className="text-left p-2">Keterangan</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {mutationLogs
                                    .slice(0, 40)
                                    .map((log) => (
                                        <tr key={`mut-${log.id}`}>
                                            <td className="p-2">{new Date(log.date).toLocaleString()}</td>
                                            <td className="p-2">{log.roomName}</td>
                                            <td className="p-2 font-semibold">{log.item}</td>
                                            <td className="p-2">{normalizeActionLabel(log.action)}</td>
                                            <td className="p-2">{mutationDescription(log)}</td>
                                        </tr>
                                    ))}
                                {mutationLogs.length === 0 && (
                                    <tr><td className="p-3 text-slate-500" colSpan={5}>Tidak ada mutasi barang pada periode ini.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
                )}

                {shouldShowReportSection('deletion') && (
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">3. Penghapusan Barang</h3>
                        <p className="text-sm text-slate-500">Riwayat barang yang dihapus pada periode terpilih.</p>
                    </div>
                    <div className="p-5">
                        {historyError && (
                            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                                {historyError}
                            </div>
                        )}
                        <table className="w-full text-sm">
                            <thead className="text-slate-500 bg-slate-50">
                                <tr>
                                    <th className="text-left p-2">No</th>
                                    <th className="text-left p-2">No Inventaris</th>
                                    <th className="text-left p-2">Tanggal Pengadaan</th>
                                    <th className="text-left p-2">Tanggal Penghapusan</th>
                                    <th className="text-left p-2">Keterangan Kondisi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {deletionHistoryRows.map((row, index) => (
                                    <tr key={`del-${row.id}`}>
                                        <td className="p-2">{index + 1}</td>
                                        <td className="p-2 font-semibold">{row.sku}</td>
                                        <td className="p-2">{row.procurementDate === '-' ? '-' : new Date(row.procurementDate).toLocaleDateString('id-ID')}</td>
                                        <td className="p-2">{new Date(row.deletionDate).toLocaleDateString('id-ID')}</td>
                                        <td className="p-2">{row.conditionText}</td>
                                    </tr>
                                ))}
                                {!historyLoading && deletionHistoryRows.length === 0 && (
                                    <tr><td className="p-3 text-slate-500" colSpan={5}>Tidak ada riwayat penghapusan pada periode ini.</td></tr>
                                )}
                                {historyLoading && (
                                    <tr><td className="p-3 text-slate-500" colSpan={5}>Memuat riwayat penghapusan...</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
                )}

                {shouldShowReportSection('maintenance') && (
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">4. Kondisi & Pemeliharaan</h3>
                        <p className="text-sm text-slate-500">Barang yang perlu perbaikan dan status barang rusak (sudah/belum diperbaiki).</p>
                    </div>
                    <div className="p-5 space-y-6">
                        <div>
                            <h4 className="font-bold text-slate-800 mb-2">Log Pemeliharaan Bulanan</h4>
                            <table className="w-full text-sm">
                                <thead className="text-slate-500 bg-slate-50">
                                    <tr>
                                        <th className="text-left p-2">Tanggal</th>
                                        <th className="text-left p-2">Ruangan</th>
                                        <th className="text-left p-2">Barang</th>
                                        <th className="text-left p-2">Aksi</th>
                                        <th className="text-left p-2">Status</th>
                                        <th className="text-left p-2">Keterangan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {maintenanceRows.slice(0, 40).map((row) => (
                                        <tr key={`mnt-${row.id}`}>
                                            <td className="p-2">{new Date(row.date).toLocaleString()}</td>
                                            <td className="p-2">{row.roomName}</td>
                                            <td className="p-2 font-semibold">{row.item}</td>
                                            <td className="p-2">{row.action}</td>
                                            <td className="p-2">{row.maintenanceStatus}</td>
                                            <td className="p-2">{row.detailsText}</td>
                                        </tr>
                                    ))}
                                    {maintenanceRows.length === 0 && (
                                        <tr><td className="p-3 text-slate-500" colSpan={6}>Tidak ada aktivitas maintenance pada periode ini.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-800 mb-2">Barang yang Perlu Perbaikan (Current State)</h4>
                            <table className="w-full text-sm">
                                <thead className="text-slate-500 bg-slate-50">
                                    <tr>
                                        <th className="text-left p-2">Barang</th>
                                        <th className="text-left p-2">Kondisi</th>
                                        <th className="text-left p-2">Lokasi</th>
                                        <th className="text-left p-2">Aksi Terakhir</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {needsRepairItems.slice(0, 40).map((item) => (
                                        <tr key={`repair-${item.id}`}>
                                            <td className="p-2 font-semibold">{item.name}</td>
                                            <td className="p-2">{conditionLabel(item.condition)}</td>
                                            <td className="p-2">{item.location}</td>
                                            <td className="p-2">{item.latestAction}</td>
                                        </tr>
                                    ))}
                                    {needsRepairItems.length === 0 && (
                                        <tr><td className="p-3 text-slate-500" colSpan={4}>Tidak ada barang yang perlu perbaikan saat ini.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
                )}

                {shouldShowReportSection('category') && (
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">5. Rekap per Kategori</h3>
                    </div>
                    <div className="p-5">
                        <table className="w-full text-sm">
                            <thead className="text-slate-500 bg-slate-50">
                                <tr>
                                    <th className="text-left p-2">Kategori</th>
                                    <th className="text-left p-2">Jumlah Item</th>
                                    <th className="text-left p-2">Total Qty</th>
                                    <th className="text-left p-2">Baik</th>
                                    <th className="text-left p-2">Perlu Perbaikan</th>
                                    <th className="text-left p-2">Rusak Ringan</th>
                                    <th className="text-left p-2">Rusak Berat</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {categorySummary.map((row) => (
                                    <tr key={`cat-${row.category}`}>
                                        <td className="p-2 font-semibold">{row.category}</td>
                                        <td className="p-2">{row.itemCount}</td>
                                        <td className="p-2">{row.totalQty}</td>
                                        <td className="p-2">{row.good}</td>
                                        <td className="p-2">{row.service}</td>
                                        <td className="p-2">{row.damaged}</td>
                                        <td className="p-2">{row.broken}</td>
                                    </tr>
                                ))}
                                {categorySummary.length === 0 && (
                                    <tr><td className="p-3 text-slate-500" colSpan={7}>Belum ada data kategori.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
                )}

                {shouldShowReportSection('room') && (
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">6. Rekap per Ruangan</h3>
                    </div>
                    <div className="p-5">
                        <table className="w-full text-sm">
                            <thead className="text-slate-500 bg-slate-50">
                                <tr>
                                    <th className="text-left p-2">Ruangan</th>
                                    <th className="text-left p-2">Jumlah Item</th>
                                    <th className="text-left p-2">Total Qty</th>
                                    <th className="text-left p-2">Baik</th>
                                    <th className="text-left p-2">Perlu Perbaikan</th>
                                    <th className="text-left p-2">Rusak Ringan</th>
                                    <th className="text-left p-2">Rusak Berat</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {roomSummary.map((row) => (
                                    <tr key={`room-${row.roomName}`}>
                                        <td className="p-2 font-semibold">{row.roomName}</td>
                                        <td className="p-2">{row.itemCount}</td>
                                        <td className="p-2">{row.totalQty}</td>
                                        <td className="p-2">{row.good}</td>
                                        <td className="p-2">{row.service}</td>
                                        <td className="p-2">{row.damaged}</td>
                                        <td className="p-2">{row.broken}</td>
                                    </tr>
                                ))}
                                {roomSummary.length === 0 && (
                                    <tr><td className="p-3 text-slate-500" colSpan={7}>Belum ada data ruangan.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
                )}
            </div>
        </div>
    );
};

export default ReportPage;
