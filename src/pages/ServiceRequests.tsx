import { useEffect, useMemo, useRef, useState } from 'react';
import { useServiceRequests } from '../context/ServiceRequestContext';
import { useInventory } from '../context/InventoryContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useAccessMatrix } from '../context/AccessMatrixContext';
import { CheckCircle, ChevronDown, ChevronUp, Clock, Download, History, Search, XCircle } from 'lucide-react';
import type { RequestStatus, ServiceRequest, Container } from '../types';
import ContainerDetailModal from '../components/inventory/ContainerDetailModal';
import { AnimatePresence } from 'framer-motion';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const getRequestTimestamp = (requestDate: string) => {
    const normalized = requestDate.trim();
    if (normalized.length === 0) return 0;

    if (normalized.includes('T') || normalized.includes('-')) {
        const isoTimestamp = new Date(normalized).getTime();
        if (Number.isFinite(isoTimestamp)) return isoTimestamp;
    }

    const match = normalized.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(AM|PM)?)?$/i
    );

    if (!match) {
        const fallbackTimestamp = new Date(normalized).getTime();
        return Number.isFinite(fallbackTimestamp) ? fallbackTimestamp : 0;
    }

    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    let hour = Number(match[4] ?? '0');
    const minute = Number(match[5] ?? '0');
    const secondValue = Number(match[6] ?? '0');
    const period = match[7]?.toUpperCase();

    let month = first;
    let day = second;

    if (first > 12) {
        day = first;
        month = second;
    } else if (second > 12) {
        month = first;
        day = second;
    }

    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    return new Date(year, month - 1, day, hour, minute, secondValue).getTime();
};

const formatRequestDate = (requestDate: string) => {
    const timestamp = getRequestTimestamp(requestDate);
    if (!timestamp) {
        return {
            date: '-',
            time: '-',
            full: '-'
        };
    }

    const date = new Date(timestamp);
    return {
        date: date.toLocaleDateString('id-ID'),
        time: date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        full: date.toLocaleString('id-ID')
    };
};

const getRequestMonthKey = (requestDate: string) => {
    const timestamp = getRequestTimestamp(requestDate);
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getRequestMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-').map(Number);
    if (!year || !month) return monthKey;
    return new Date(year, month - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

const getResolutionOutcomeLabel = (outcome?: ServiceRequest['resolutionOutcome']) => {
    if (outcome === 'repaired') return 'Diperbaiki';
    if (outcome === 'broken') return 'Tidak Bisa Diperbaiki';
    return '-';
};

const getResolutionOutcomeClassName = (outcome?: ServiceRequest['resolutionOutcome']) => {
    if (outcome === 'repaired') return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
    if (outcome === 'broken') return 'border border-rose-200 bg-rose-50 text-rose-700';
    return 'border border-slate-200 bg-slate-50 text-slate-500';
};

const ServiceRequests = () => {
    const { requests, updateRequestStatus } = useServiceRequests();
    const { getRoom, updateRoom, rooms, refreshRooms } = useInventory(); // Get access to live inventory
    const { t } = useLanguage();
    const { user } = useAuth();
    const { canEditFeature } = useAccessMatrix();
    const [filterStatus, setFilterStatus] = useState<RequestStatus | 'all'>('all');
    const [timeFilter, setTimeFilter] = useState<'all' | 'today' | '7d' | '30d' | '90d'>('all');
    const [dateSortOrder, setDateSortOrder] = useState<'desc' | 'asc'>('desc');
    const [isDateMenuOpen, setIsDateMenuOpen] = useState(false);
    const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<'all' | string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [acceptNote, setAcceptNote] = useState('');
    const [completionNote, setCompletionNote] = useState('');

    // Modal State
    const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [initialSelection, setInitialSelection] = useState<string | undefined>(undefined);

    const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const dateMenuRef = useRef<HTMLDivElement | null>(null);
    const canManageServiceRequests = user ? canEditFeature('service_requests', user.role) : false;

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!dateMenuRef.current?.contains(event.target as Node)) {
                setIsDateMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, []);

    const handleItemClick = (req: ServiceRequest) => {
        const room = getRoom(req.roomId);
        if (!room) return;

        // Find container/station
        const container = room.containers?.find(c => c.id === req.stationId);

        if (container) {
            setSelectedRoomId(room.id);
            setSelectedContainer(container);
            setInitialSelection(req.componentId);
        }
    };

    const handleUpdateContainer = async (updatedContainer: Container) => {
        const room = rooms.find(r => r.containers?.some(c => c.id === updatedContainer.id));
        if (room) {
            const updatedRoom = {
                ...room,
                containers: room.containers?.map(c => c.id === updatedContainer.id ? updatedContainer : c) || []
            };
            try {
                await updateRoom(updatedRoom);
                setSelectedContainer(updatedContainer);
            } catch (error) {
                console.error('Failed to sync container update:', error);
                alert(error instanceof Error ? error.message : 'Gagal menyimpan perubahan container.');
            }
        }
    };

    const sortedRequests = useMemo(
        () => [...requests].sort((a, b) => getRequestTimestamp(b.requestDate) - getRequestTimestamp(a.requestDate)),
        [requests]
    );

    const filteredRequests = useMemo(() => {
        const filtered = sortedRequests.filter(req => {
            const matchesStatus = filterStatus === 'all' || req.status === filterStatus;

            const requestTime = getRequestTimestamp(req.requestDate);
            const now = new Date();
            const dayInMs = 24 * 60 * 60 * 1000;
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const startOfTomorrow = startOfToday + dayInMs;
            const matchesTime = (() => {
                if (!Number.isFinite(requestTime) || requestTime <= 0) return false;
                if (timeFilter === 'all') return true;
                if (timeFilter === 'today') return requestTime >= startOfToday && requestTime < startOfTomorrow;
                if (timeFilter === '7d') return requestTime >= (startOfToday - 6 * dayInMs) && requestTime < startOfTomorrow;
                if (timeFilter === '30d') return requestTime >= (startOfToday - 29 * dayInMs) && requestTime < startOfTomorrow;
                if (timeFilter === '90d') return requestTime >= (startOfToday - 89 * dayInMs) && requestTime < startOfTomorrow;
                return true;
            })();

            const normalizedSearch = searchTerm.toLowerCase();
            const componentName = typeof req.componentName === 'string' ? req.componentName.toLowerCase() : '';
            const description = typeof req.description === 'string' ? req.description.toLowerCase() : '';
            const stationName = typeof req.stationName === 'string' ? req.stationName.toLowerCase() : '';
            const roomName = typeof req.roomName === 'string' ? req.roomName.toLowerCase() : '';
            const matchesSearch = componentName.includes(normalizedSearch) ||
                description.includes(normalizedSearch) ||
                stationName.includes(normalizedSearch) ||
                roomName.includes(normalizedSearch);
            return matchesStatus && matchesSearch && matchesTime;
        });

        return filtered.sort((a, b) => (
            dateSortOrder === 'desc'
                ? getRequestTimestamp(b.requestDate) - getRequestTimestamp(a.requestDate)
                : getRequestTimestamp(a.requestDate) - getRequestTimestamp(b.requestDate)
        ));
    }, [dateSortOrder, filterStatus, searchTerm, sortedRequests, timeFilter]);

    const historySummary = useMemo(() => {
        const monthMap = new Map<string, {
            key: string;
            label: string;
            total: number;
            pending: number;
            accepted: number;
            completed: number;
            denied: number;
        }>();

        sortedRequests.forEach((req) => {
            const key = getRequestMonthKey(req.requestDate);
            if (!key) return;
            if (!monthMap.has(key)) {
                monthMap.set(key, {
                    key,
                    label: getRequestMonthLabel(key),
                    total: 0,
                    pending: 0,
                    accepted: 0,
                    completed: 0,
                    denied: 0
                });
            }

            const entry = monthMap.get(key)!;
            entry.total += 1;
            entry[req.status] += 1;
        });

        return [...monthMap.values()].sort((a, b) => b.key.localeCompare(a.key));
    }, [sortedRequests]);

    const historyFilteredRequests = useMemo(() => (
        selectedHistoryMonth === 'all'
            ? sortedRequests
            : sortedRequests.filter((request) => getRequestMonthKey(request.requestDate) === selectedHistoryMonth)
    ), [selectedHistoryMonth, sortedRequests]);

    const exportRequestsPdf = (rows: ServiceRequest[], title: string, filename: string) => {
        const doc = new jsPDF('landscape', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const now = new Date();

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(title, pageWidth / 2, 18, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text('SMPK SANTA MARIA 2 MALANG — Portal Inventory', pageWidth / 2, 25, { align: 'center' });
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`Dicetak: ${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`, pageWidth / 2, 31, { align: 'center' });
        doc.setTextColor(0);
        doc.setDrawColor(0, 0, 128);
        doc.setLineWidth(0.5);
        doc.line(14, 34, pageWidth - 14, 34);

        autoTable(doc, {
            startY: 40,
            head: [['No', 'Tanggal', 'Komponen', 'Lokasi', 'Pelapor', 'Status', 'Hasil', 'Deskripsi', 'Catatan']],
            body: rows.map((req, index) => [
                String(index + 1),
                new Date(req.requestDate).toLocaleString('id-ID'),
                req.componentName,
                `${req.roomName || '-'} / ${req.stationName || '-'}`,
                req.requesterName || '-',
                req.status,
                getResolutionOutcomeLabel(req.resolutionOutcome),
                req.description || '-',
                req.rejectionReason || (req.resolutionDate ? `Selesai: ${new Date(req.resolutionDate).toLocaleString('id-ID')}` : '-')
            ]),
            styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
            headStyles: { fillColor: [0, 0, 128], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            margin: { left: 14, right: 14 }
        });

        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
        }

        doc.save(filename);
    };

    const getStatusColor = (status: RequestStatus) => {
        switch (status) {
            case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case 'accepted': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'denied': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
            case 'completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        }
    };

    const handleReject = async () => {
        if (!canManageServiceRequests || !selectedRequest || !rejectionReason.trim()) return;
        try {
            await updateRequestStatus(selectedRequest.id, 'denied', rejectionReason);
            await refreshRooms();
            setIsRejectModalOpen(false);
            setRejectionReason('');
            setSelectedRequest(null);
        } catch (error) {
            console.error('Failed to reject request:', error);
            alert(error instanceof Error ? error.message : 'Gagal memperbarui request.');
        }
    };

    const handleComplete = async (outcome: 'repaired' | 'broken') => {
        if (!canManageServiceRequests || !selectedRequest) return;
        try {
            await updateRequestStatus(selectedRequest.id, 'completed', undefined, outcome, completionNote);
            await refreshRooms();
            setIsCompleteModalOpen(false);
            setCompletionNote('');
            setSelectedRequest(null);
        } catch (error) {
            console.error('Failed to complete request:', error);
            alert(error instanceof Error ? error.message : 'Gagal memperbarui request.');
        }
    };

    const handleAccept = async () => {
        if (!canManageServiceRequests || !selectedRequest) return;
        try {
            await updateRequestStatus(selectedRequest.id, 'accepted', undefined, undefined, acceptNote);
            await refreshRooms();
            setIsAcceptModalOpen(false);
            setAcceptNote('');
            setSelectedRequest(null);
        } catch (error) {
            console.error('Failed to accept request:', error);
            alert(error instanceof Error ? error.message : 'Gagal memperbarui request.');
        }
    };

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="mb-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{t('service_requests_title')}</h1>
                        <p className="text-gray-500">{t('service_requests_subtitle')}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={() => setIsHistoryModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <History size={16} />
                            History
                        </button>
                        <button
                            type="button"
                            onClick={() => exportRequestsPdf(filteredRequests, 'LAPORAN PERMINTAAN LAYANAN', `Permintaan_Layanan_${new Date().toISOString().slice(0, 10)}.pdf`)}
                            disabled={filteredRequests.length === 0}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-sm font-semibold text-white hover:bg-[#000060] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Download size={16} />
                            Export
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6 flex-wrap">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder={t('search_requests')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    {(['all', 'pending', 'accepted', 'completed', 'denied'] as const).map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${filterStatus === status
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            {t(`status_${status}` as any)}
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="overflow-x-auto flex-1 flex flex-col">
                    <div className="min-w-[900px] flex flex-col flex-1">
                        <div className="grid grid-cols-12 gap-4 p-4 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider sticky top-0 z-10">
                            <div className="col-span-3">{t('col_component')}</div>
                            <div className="col-span-3">{t('col_issue')}</div>
                            <div className="col-span-2">{t('col_requester')}</div>
                            <div className="col-span-2">
                                <div ref={dateMenuRef} className="relative">
                                    <span>{t('col_date')}</span>
                                    <button
                                        type="button"
                                        onClick={() => setIsDateMenuOpen((current) => !current)}
                                        className="mt-2 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold normal-case text-slate-700 shadow-sm hover:border-slate-300"
                                    >
                                        <span className="truncate">
                                            {dateSortOrder === 'desc' ? 'Terbaru' : 'Terlama'} • {
                                                timeFilter === 'all' ? 'Semua tanggal' :
                                                    timeFilter === 'today' ? 'Hari ini' :
                                                        timeFilter === '7d' ? '7 hari' :
                                                            timeFilter === '30d' ? '30 hari' : '90 hari'
                                            }
                                        </span>
                                        {isDateMenuOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>

                                    {isDateMenuOpen && (
                                        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10">
                                            <div>
                                                <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Urutan</p>
                                                <div className="mt-2 grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setDateSortOrder('desc');
                                                            setIsDateMenuOpen(false);
                                                        }}
                                                        className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors ${dateSortOrder === 'desc'
                                                            ? 'bg-[#000080] text-white'
                                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                            }`}
                                                    >
                                                        Terbaru
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setDateSortOrder('asc');
                                                            setIsDateMenuOpen(false);
                                                        }}
                                                        className={`rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors ${dateSortOrder === 'asc'
                                                            ? 'bg-[#000080] text-white'
                                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                            }`}
                                                    >
                                                        Terlama
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-4">
                                                <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Filter tanggal</p>
                                                <div className="mt-2 grid grid-cols-1 gap-2">
                                                    {[
                                                        { value: 'all', label: 'Semua tanggal' },
                                                        { value: 'today', label: 'Hari ini' },
                                                        { value: '7d', label: '7 hari terakhir' },
                                                        { value: '30d', label: '30 hari terakhir' },
                                                        { value: '90d', label: '90 hari terakhir' }
                                                    ].map((option) => (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            onClick={() => {
                                                                setTimeFilter(option.value as typeof timeFilter);
                                                                setIsDateMenuOpen(false);
                                                            }}
                                                            className={`rounded-xl px-3 py-2 text-left text-[11px] font-semibold transition-colors ${timeFilter === option.value
                                                                ? 'bg-blue-50 text-[#000080]'
                                                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                                                }`}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="col-span-2">{t('col_status')}</div>
                        </div>
                        <div className="overflow-y-auto flex-1">
                            {filteredRequests.length > 0 ? (
                                filteredRequests.map(req => {
                                    const roomLabel = req.roomName || getRoom(req.roomId)?.name || req.roomId || 'Unknown Room';
                                    const requesterLabel = req.requesterName || 'Unknown';

                                    return (
                                        <div key={req.id} className="grid grid-cols-12 gap-4 p-4 border-b border-gray-100 items-center hover:bg-gray-50 transition-colors">
                                            <div className="col-span-3">
                                                <div
                                                    onClick={() => handleItemClick(req)}
                                                    className="cursor-pointer group"
                                                >
                                                    <div className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                                                        {req.componentName}
                                                        <Search size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400" />
                                                    </div>
                                                    <div className="text-xs text-gray-500 flex flex-col gap-0.5 mt-0.5 group-hover:text-gray-600">
                                                        <span>{roomLabel} - {req.stationName}</span>
                                                        {(req.componentSku || req.componentCategory) && (
                                                            <span className="text-indigo-600 font-mono text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded w-fit group-hover:bg-indigo-100 transition-colors">
                                                                {req.componentSku ? `${req.componentSku}` : ''}
                                                                {req.componentSku && req.componentCategory ? ' - ' : ''}
                                                                {req.componentCategory}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="col-span-3">
                                                <p className="text-sm text-gray-600 line-clamp-2" title={req.description}>{req.description}</p>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                                                        {requesterLabel.charAt(0)}
                                                    </div>
                                                    <span className="text-sm font-medium text-gray-700 truncate">{requesterLabel}</span>
                                                </div>
                                            </div>
                                            <div className="col-span-2 text-xs text-gray-500">
                                                {formatRequestDate(req.requestDate).date}
                                                <div className="text-[10px] text-gray-400">{formatRequestDate(req.requestDate).time}</div>
                                            </div>
                                            <div className="col-span-2 flex items-center justify-between gap-2">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(req.status)} whitespace-nowrap`}>
                                                    {req.status === 'pending' && <Clock size={12} />}
                                                    {req.status === 'accepted' && <CheckCircle size={12} />}
                                                    {req.status === 'denied' && <XCircle size={12} />}
                                                    {req.status === 'completed' && <CheckCircle size={12} />}
                                                    <span className="capitalize">{t(`status_${req.status}` as any)}</span>
                                                </span>

                                                {/* Actions moved to same column to save space */}
                                                <div className="flex gap-1">
                                                    {canManageServiceRequests && req.status === 'pending' && (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedRequest(req);
                                                                    setAcceptNote('');
                                                                    setIsAcceptModalOpen(true);
                                                                }}
                                                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded shadow-sm border border-emerald-100 bg-white"
                                                                title="Accept"
                                                            >
                                                                <CheckCircle size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => { setSelectedRequest(req); setIsRejectModalOpen(true); }}
                                                                className="p-1.5 text-rose-600 hover:bg-rose-50 rounded shadow-sm border border-rose-100 bg-white"
                                                                title="Deny"
                                                            >
                                                                <XCircle size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {canManageServiceRequests && req.status === 'accepted' && (
                                                        <button
                                                            onClick={() => {
                                                                setSelectedRequest(req);
                                                                setCompletionNote('');
                                                                setIsCompleteModalOpen(true);
                                                            }}
                                                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded shadow-sm border border-indigo-100 bg-white"
                                                            title="Mark Complete"
                                                        >
                                                            <CheckCircle size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-12">
                                    <Clock size={48} className="mb-4 opacity-20" />
                                    <p>{t('no_requests')}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Reject Modal */}
            {canManageServiceRequests && isAcceptModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Terima Permintaan</h3>
                        <p className="text-sm text-gray-500 mb-4">Tambahkan catatan proses (opsional) agar tampil di log maintenance.</p>
                        <textarea
                            value={acceptNote}
                            onChange={(e) => setAcceptNote(e.target.value)}
                            className="w-full h-28 p-3 border border-gray-200 rounded-lg mb-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder="Contoh: Dijadwalkan cek teknisi jam 10.00"
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setIsAcceptModalOpen(false);
                                    setSelectedRequest(null);
                                    setAcceptNote('');
                                }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                {t('btn_cancel')}
                            </button>
                            <button
                                onClick={() => { void handleAccept(); }}
                                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-500"
                            >
                                Terima
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject Modal */}
            {canManageServiceRequests && isRejectModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{t('deny_title')}</h3>
                        <p className="text-sm text-gray-500 mb-4">{t('deny_desc')}</p>
                        <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="w-full h-32 p-3 border border-gray-200 rounded-lg mb-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder={t('deny_reason_placeholder')}
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setIsRejectModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                {t('btn_cancel')}
                            </button>
                            <button
                                onClick={() => { void handleReject(); }}
                                disabled={!rejectionReason.trim()}
                                className="px-4 py-2 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t('btn_deny')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Complete Modal */}
            {canManageServiceRequests && isCompleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{t('complete_title')}</h3>
                        <p className="text-sm text-gray-500 mb-4">{t('complete_desc')}</p>
                        <textarea
                            value={completionNote}
                            onChange={(e) => setCompletionNote(e.target.value)}
                            className="w-full h-24 p-3 border border-gray-200 rounded-lg mb-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder="Catatan hasil perbaikan (opsional)"
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => { void handleComplete('repaired'); }}
                                className="flex flex-col items-center gap-2 p-4 border border-emerald-200 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors group"
                            >
                                <CheckCircle className="text-emerald-500 group-hover:scale-110 transition-transform" size={32} />
                                <span className="font-bold text-emerald-700">{t('outcome_repaired')}</span>
                                <span className="text-xs text-emerald-600/80 text-center">{t('outcome_repaired_desc')}</span>
                            </button>
                            <button
                                onClick={() => { void handleComplete('broken'); }}
                                className="flex flex-col items-center gap-2 p-4 border border-rose-200 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors group"
                            >
                                <XCircle className="text-rose-500 group-hover:scale-110 transition-transform" size={32} />
                                <span className="font-bold text-rose-700">{t('outcome_broken')}</span>
                                <span className="text-xs text-rose-600/80 text-center">{t('outcome_broken_desc')}</span>
                            </button>
                        </div>
                        <button
                            onClick={() => {
                                setIsCompleteModalOpen(false);
                                setCompletionNote('');
                                setSelectedRequest(null);
                            }}
                            className="mt-6 w-full py-2 text-gray-500 hover:text-gray-700 text-sm"
                        >
                            {t('btn_cancel')}
                        </button>
                    </div>
                </div>
            )}

            {isHistoryModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">History Permintaan Layanan</h3>
                                <p className="text-sm text-slate-500">Ringkasan semua permintaan layanan yang pernah masuk.</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => exportRequestsPdf(historyFilteredRequests, 'HISTORY PERMINTAAN LAYANAN', `History_Permintaan_Layanan_${new Date().toISOString().slice(0, 10)}.pdf`)}
                                    disabled={historyFilteredRequests.length === 0}
                                    className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2 text-sm font-semibold text-white hover:bg-[#000060] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Download size={16} />
                                    Export History
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsHistoryModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                                >
                                    Tutup
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-sm font-bold text-slate-900">Filter Bulan</p>
                                    <p className="text-xs text-slate-500">Batasi history berdasarkan bulan tertentu.</p>
                                </div>
                                <select
                                    value={selectedHistoryMonth}
                                    onChange={(event) => setSelectedHistoryMonth(event.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-[#000080] sm:w-72"
                                >
                                    <option value="all">Semua bulan</option>
                                    {historySummary.map((entry) => (
                                        <option key={entry.key} value={entry.key}>{entry.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                {historySummary.map((entry) => (
                                    <div
                                        key={entry.key}
                                        className="text-left rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                    >
                                        <p className="text-sm font-bold text-slate-900">{entry.label}</p>
                                        <p className="text-2xl font-extrabold text-[#000080] mt-1">{entry.total}</p>
                                        <div className="mt-3 text-xs text-slate-500 space-y-1">
                                            <div>Pending: {entry.pending}</div>
                                            <div>Accepted: {entry.accepted}</div>
                                            <div>Completed: {entry.completed}</div>
                                            <div>Denied: {entry.denied}</div>
                                        </div>
                                    </div>
                                ))}
                                {historySummary.length === 0 && (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                                        Belum ada history permintaan layanan.
                                    </div>
                                )}
                            </div>

                            <div className="rounded-2xl border border-slate-200 overflow-hidden">
                                <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                    <div className="col-span-2">Tanggal</div>
                                    <div className="col-span-2">Komponen</div>
                                    <div className="col-span-2">Lokasi</div>
                                    <div className="col-span-2">Pelapor</div>
                                    <div className="col-span-1">Status</div>
                                    <div className="col-span-1">Hasil</div>
                                    <div className="col-span-2">Catatan</div>
                                </div>
                                <div className="max-h-[320px] overflow-y-auto">
                                    {historyFilteredRequests.map((req) => (
                                        <div key={`history-${req.id}`} className="grid grid-cols-12 gap-4 p-4 border-b border-slate-100 text-sm items-start">
                                            <div className="col-span-2 text-slate-600">{formatRequestDate(req.requestDate).full}</div>
                                            <div className="col-span-2">
                                                <p className="font-semibold text-slate-900">{req.componentName}</p>
                                                <p className="text-xs text-slate-500">{req.componentSku || req.componentCategory || '-'}</p>
                                            </div>
                                            <div className="col-span-2 text-slate-600">{req.roomName || '-'} / {req.stationName || '-'}</div>
                                            <div className="col-span-2 text-slate-600">{req.requesterName || '-'}</div>
                                            <div className="col-span-1">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(req.status)}`}>
                                                    <span className="capitalize">{req.status}</span>
                                                </span>
                                            </div>
                                            <div className="col-span-1">
                                                <span className={`inline-flex min-h-8 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getResolutionOutcomeClassName(req.resolutionOutcome)}`}>
                                                    {getResolutionOutcomeLabel(req.resolutionOutcome)}
                                                </span>
                                            </div>
                                            <div className="col-span-2 text-slate-600">{req.rejectionReason || (req.resolutionDate ? `Selesai ${new Date(req.resolutionDate).toLocaleDateString('id-ID')}` : '-')}</div>
                                        </div>
                                    ))}
                                    {historyFilteredRequests.length === 0 && (
                                        <div className="p-6 text-sm text-slate-500">Belum ada data history.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Detail Modals */}
            <AnimatePresence>
                {selectedContainer && (
                    <ContainerDetailModal
                        key="container-modal"
                        container={selectedContainer}
                        roomId={selectedRoomId ?? undefined}
                        roomName={selectedRoomId ? (getRoom(selectedRoomId)?.name ?? undefined) : undefined}
                        initialItemId={initialSelection}
                        onClose={() => { setSelectedContainer(null); setSelectedRoomId(null); setInitialSelection(undefined); }}
                        onUpdate={(container) => { void handleUpdateContainer(container); }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default ServiceRequests;
