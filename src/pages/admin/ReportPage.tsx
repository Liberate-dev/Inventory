import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, TrendingUp, AlertTriangle, Wrench } from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';
import type { ComponentCondition, ItemLog } from '../../types';

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
    if (condition === 'good') return 'Baik';
    if (condition === 'service') return 'Perlu perbaikan';
    if (condition === 'damaged') return 'Rusak ringan';
    return 'Rusak berat';
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

const ReportPage = () => {
    const navigate = useNavigate();
    const { rooms } = useInventory();
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));

    const handlePrint = () => {
        window.print();
    };

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

        rooms.forEach((room) => {
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
    }, [rooms, selectedMonth]);

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
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="border border-slate-200 rounded-xl px-4 py-2 bg-white outline-none focus:ring-2 focus:ring-[#000080]"
                        />
                        <button
                            onClick={handlePrint}
                            className="bg-[#000080] hover:bg-[#000060] text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold shadow-md shadow-blue-900/10 transition-all"
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
                                {monthlyLogs
                                    .filter((log) => isStockInAction(log.action) || isOutgoingAction(log.action) || log.action === 'TRANSFER')
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
                                {monthlyLogs.filter((log) => isStockInAction(log.action) || isOutgoingAction(log.action) || log.action === 'TRANSFER').length === 0 && (
                                    <tr><td className="p-3 text-slate-500" colSpan={5}>Tidak ada mutasi barang pada periode ini.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">3. Kondisi & Pemeliharaan</h3>
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

                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">4. Rekap per Kategori</h3>
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

                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-lg text-slate-900">5. Rekap per Ruangan</h3>
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
            </div>
        </div>
    );
};

export default ReportPage;
