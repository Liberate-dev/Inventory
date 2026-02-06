import { useState } from 'react';
import { useServiceRequests } from '../context/ServiceRequestContext';
import { useInventory } from '../context/InventoryContext';
import { useLanguage } from '../context/LanguageContext';
import { CheckCircle, XCircle, Clock, Search } from 'lucide-react';
import type { RequestStatus, ServiceRequest, Container } from '../types';
import StationDetailModal from '../components/StationDetailModal';
import ContainerDetailModal from '../components/ContainerDetailModal';
import { AnimatePresence } from 'framer-motion';

const ServiceRequests = () => {
    const { requests, updateRequestStatus } = useServiceRequests();
    const { getRoom, updateRoom, rooms } = useInventory(); // Get access to live inventory
    const { t } = useLanguage();
    const [filterStatus, setFilterStatus] = useState<RequestStatus | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    // Modal State
    const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
    const [modalType, setModalType] = useState<'station' | 'container' | null>(null);
    const [initialSelection, setInitialSelection] = useState<string | undefined>(undefined);

    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);

    const handleItemClick = (req: ServiceRequest) => {
        const room = getRoom(req.roomId);
        if (!room) return;

        // Find container/station
        let container = room.containers?.find(c => c.id === req.stationId);

        if (container) {
            setSelectedContainer(container);

            if (container.type === 'table') {
                setModalType('station');
                // Map componentId to Station Component Key ('monitor', 'pc', etc.)
                // We find the item in the container to check its type
                const item = container.items?.find(i => i.id === req.componentId);
                if (item) {
                    const type = (item.type || item.category || '').toLowerCase();
                    let key = '';
                    if (['monitor', 'screen', 'display'].some(t => type.includes(t))) key = 'monitor';
                    else if (['keyboard', 'keypad'].some(t => type.includes(t))) key = 'keyboard';
                    else if (['mouse', 'trackpad'].some(t => type.includes(t))) key = 'mouse';
                    else if (['pc', 'computer', 'desktop', 'tower', 'pc unit'].some(t => type.includes(t))) key = 'pc';
                    else if (['desk', 'table', 'physical desk', 'workstation'].some(t => type.includes(t))) key = 'desk';

                    setInitialSelection(key || undefined);
                } else {
                    setInitialSelection(undefined);
                }
            } else {
                setModalType('container');
                // For regular containers, we pass the Item ID directly
                setInitialSelection(req.componentId);
            }
        }
    };

    const handleUpdateContainer = (updatedContainer: Container) => {
        const room = rooms.find(r => r.containers?.some(c => c.id === updatedContainer.id));
        if (room) {
            const updatedRoom = {
                ...room,
                containers: room.containers?.map(c => c.id === updatedContainer.id ? updatedContainer : c) || []
            };
            updateRoom(updatedRoom);
            setSelectedContainer(updatedContainer);
        }
    };

    const filteredRequests = requests.filter(req => {
        const matchesStatus = filterStatus === 'all' || req.status === filterStatus;
        const matchesSearch = req.componentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
            req.stationName.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const getStatusColor = (status: RequestStatus) => {
        switch (status) {
            case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
            case 'accepted': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            case 'denied': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
            case 'completed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        }
    };

    const handleReject = () => {
        if (!selectedRequest || !rejectionReason.trim()) return;
        updateRequestStatus(selectedRequest.id, 'denied', rejectionReason);
        setIsRejectModalOpen(false);
        setRejectionReason('');
        setSelectedRequest(null);
    };

    const handleComplete = (outcome: 'repaired' | 'broken') => {
        if (!selectedRequest) return;
        // Ideally we would update the component status here too, but for this mock
        // we mainly trust the status propagation logic in StationDetailModal (or future integration).
        // For now, we mark the request completed.
        // NOTE: Real implementation would physically update the Item's status in the Room/Container context.
        updateRequestStatus(selectedRequest.id, 'completed', `Outcome: ${outcome}`);
        setIsCompleteModalOpen(false);
        setSelectedRequest(null);
    };

    return (
        <div className="p-6 h-full flex flex-col">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">{t('service_requests_title')}</h1>
                <p className="text-gray-500">{t('service_requests_subtitle')}</p>
            </div>

            {/* Filters */}
            <div className="flex gap-4 mb-6">
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
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex-1 overflow-hidden flex flex-col">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <div className="col-span-3">{t('col_component')}</div>
                    <div className="col-span-3">{t('col_issue')}</div>
                    <div className="col-span-2">{t('col_requester')}</div>
                    <div className="col-span-2">{t('col_date')}</div>
                    <div className="col-span-2">{t('col_status')}</div>
                </div>
                <div className="overflow-y-auto flex-1">
                    {filteredRequests.length > 0 ? (
                        filteredRequests.map(req => (
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
                                            <span>{req.roomId === 'lab-comp' ? 'Computer Lab 1' : req.roomId} • {req.stationName}</span>
                                            {(req.componentSku || req.componentCategory) && (
                                                <span className="text-indigo-600 font-mono text-[10px] bg-indigo-50 px-1.5 py-0.5 rounded w-fit group-hover:bg-indigo-100 transition-colors">
                                                    {req.componentSku ? `${req.componentSku}` : ''}
                                                    {req.componentSku && req.componentCategory ? ' • ' : ''}
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
                                            {req.requesterName ? req.requesterName.charAt(0) : '?'}
                                        </div>
                                        <span className="text-sm font-medium text-gray-700 truncate">{req.requesterName || 'Unknown'}</span>
                                    </div>
                                </div>
                                <div className="col-span-2 text-xs text-gray-500">
                                    {new Date(req.requestDate).toLocaleDateString()}
                                    <div className="text-[10px] text-gray-400">{new Date(req.requestDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
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
                                        {req.status === 'pending' && (
                                            <>
                                                <button
                                                    onClick={() => updateRequestStatus(req.id, 'accepted')}
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
                                        {req.status === 'accepted' && (
                                            <button
                                                onClick={() => { setSelectedRequest(req); setIsCompleteModalOpen(true); }}
                                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded shadow-sm border border-indigo-100 bg-white"
                                                title="Mark Complete"
                                            >
                                                <CheckCircle size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-12">
                            <Clock size={48} className="mb-4 opacity-20" />
                            <p>{t('no_requests')}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Reject Modal */}
            {isRejectModalOpen && (
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
                                onClick={handleReject}
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
            {isCompleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{t('complete_title')}</h3>
                        <p className="text-sm text-gray-500 mb-6">{t('complete_desc')}</p>
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => handleComplete('repaired')}
                                className="flex flex-col items-center gap-2 p-4 border border-emerald-200 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors group"
                            >
                                <CheckCircle className="text-emerald-500 group-hover:scale-110 transition-transform" size={32} />
                                <span className="font-bold text-emerald-700">{t('outcome_repaired')}</span>
                                <span className="text-xs text-emerald-600/80 text-center">{t('outcome_repaired_desc')}</span>
                            </button>
                            <button
                                onClick={() => handleComplete('broken')}
                                className="flex flex-col items-center gap-2 p-4 border border-rose-200 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors group"
                            >
                                <XCircle className="text-rose-500 group-hover:scale-110 transition-transform" size={32} />
                                <span className="font-bold text-rose-700">{t('outcome_broken')}</span>
                                <span className="text-xs text-rose-600/80 text-center">{t('outcome_broken_desc')}</span>
                            </button>
                        </div>
                        <button
                            onClick={() => setIsCompleteModalOpen(false)}
                            className="mt-6 w-full py-2 text-gray-500 hover:text-gray-700 text-sm"
                        >
                            {t('btn_cancel')}
                        </button>
                    </div>
                </div>
            )}
            {/* Detail Modals */}
            <AnimatePresence>
                {selectedContainer && (
                    modalType === 'station' ? (
                        <StationDetailModal
                            key="station-modal"
                            station={selectedContainer}
                            initialSelectedComponent={initialSelection}
                            onClose={() => { setSelectedContainer(null); setInitialSelection(undefined); }}
                            onUpdate={handleUpdateContainer}
                        />
                    ) : (
                        <ContainerDetailModal
                            key="container-modal"
                            container={selectedContainer}
                            initialItemId={initialSelection}
                            onClose={() => { setSelectedContainer(null); setInitialSelection(undefined); }}
                            onUpdate={handleUpdateContainer}
                        />
                    )
                )}
            </AnimatePresence>
        </div>
    );
};

export default ServiceRequests;
