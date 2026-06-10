import { useState, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useServiceRequests } from '../../context/ServiceRequestContext';
import { 
    ArrowRightLeft, ClipboardList, Search, Calendar, 
    User as UserIcon, Plus, X, CheckCircle, Wrench, 
    AlertTriangle, History as HistoryIcon 
} from 'lucide-react';
import type { ComponentStatus, Room, Container, Item, ItemLog } from '../../types';
import VerificationModal from '../../components/common/VerificationModal';
import { getItemStatusLabel, getItemStatusBadgeClasses, getItemStatusOptions } from '../../utils/itemCondition';

const parseLogDetails = (rawDetails: unknown): Record<string, unknown> => {
    if (typeof rawDetails === 'string') {
        try {
            const parsed = JSON.parse(rawDetails);
            return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {};
        } catch {
            return {};
        }
    }
    if (typeof rawDetails === 'object' && rawDetails !== null) {
        return rawDetails as Record<string, unknown>;
    }
    return {};
};

export default function OperationsPage() {
    const { rooms, updateRoom } = useInventory();
    const { user } = useAuth();
    const { addRequest } = useServiceRequests();

    // Tab State
    const [activeTab, setActiveTab] = useState<'transfer' | 'usage'>('transfer');

    // Filter scope restricted rooms
    const isScopeRestricted = Boolean(user?.labScope && user?.labScope !== 'all' && user?.labScope !== 'non-lab');
    const scopedRooms = isScopeRestricted ? rooms.filter(r => r.type === user?.labScope) : rooms;

    // Selection Modal State
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // UI Feedback
    const [showSuccess, setShowSuccess] = useState<string | null>(null);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    // Verification Modal State (for initial submit)
    const [isVerificationOpen, setIsVerificationOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<'transfer' | 'usage' | null>(null);

    // Arrival/Return Status Check Modal State
    const [arrivalCheckItem, setArrivalCheckItem] = useState<{ item: Item; room: Room; container: Container; logDetails: Record<string, unknown>; type: 'transfer' | 'usage' } | null>(null);
    const [arrivalStatus, setArrivalStatus] = useState<ComponentStatus>('good');

    // Service Request Form Modal State (when status = maintenance)
    const [serviceFormItem, setServiceFormItem] = useState<{ item: Item; room: Room; container: Container; type: 'transfer' | 'usage' } | null>(null);
    const [serviceDescription, setServiceDescription] = useState('');

    // Transfer UI State
    const [transferForm, setTransferForm] = useState({
        targetRoomId: '',
        targetContainerId: '',
        personResponsible: '',
        receiver: '',
        date: new Date().toISOString().split('T')[0]
    });

    // Usage UI State
    const [usageForm, setUsageForm] = useState({
        actionType: 'checkout' as 'checkout' | 'checkin',
        borrower: '',
        date: new Date().toISOString().split('T')[0],
        purpose: '',
        returnStatus: 'good' as ComponentStatus
    });

    // Retrieve full items for selection modal
    const allItems: { item: Item; room: Room; container: Container }[] = [];
    scopedRooms.forEach(room => {
        room.containers?.forEach(container => {
            container.items?.forEach(item => {
                allItems.push({ item, room, container });
            });
        });
    });

    const selectedItemsData = allItems.filter(i => selectedItemIds.includes(i.item.id));

    // AUTO-FILL Return Form
    useEffect(() => {
        if (activeTab === 'usage' && usageForm.actionType === 'checkin' && selectedItemIds.length === 1) {
            const selectedItemEntry = selectedItemsData[0];
            if (selectedItemEntry) {
                const { item } = selectedItemEntry;
                if (item.logs) {
                    const lastCheckoutLog = item.logs.find(l => l.action === 'CHECK_OUT');
                    if (lastCheckoutLog) {
                        const details = parseLogDetails(lastCheckoutLog.details);
                        setUsageForm(prev => ({
                            ...prev,
                            borrower: String(details.borrower || ''),
                            purpose: String(details.purpose || '')
                        }));
                    }
                }
            }
        }
    }, [selectedItemIds, usageForm.actionType, activeTab]);

    // LOGIC: Exclude source rooms from target room options
    const sourceRoomIds = new Set(selectedItemsData.map(({ room }) => room.id));
    const availableTargetRooms = scopedRooms.filter(r => !sourceRoomIds.has(r.id));

    const filteredItems = allItems.filter(({ item }) => {
        return (
            item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.id.toLowerCase().includes(searchTerm.toLowerCase())
        );
    });

    const toggleItemSelection = (id: string) => {
        setSelectedItemIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    // --- TRANSFER LOGIC ---
    const initiateTransfer = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedItemIds.length === 0 || !transferForm.targetRoomId) return;
        setPendingAction('transfer');
        setIsVerificationOpen(true);
    };

    const executeTransfer = async (verifierInfo: string) => {
        const targetRoom = rooms.find(r => r.id === transferForm.targetRoomId);
        const targetContainer = targetRoom?.containers.find(c => c.id === transferForm.targetContainerId);

        if (!targetRoom || !targetContainer) return;

        const currentRoomsState = [...rooms];
        const updateLocalState = (updatedRoom: Room) => {
            const idx = currentRoomsState.findIndex(r => r.id === updatedRoom.id);
            if (idx !== -1) currentRoomsState[idx] = updatedRoom;
        };

        selectedItemsData.forEach(({ item, room: sourceRoom, container: sourceContainer }) => {
            const currentSourceRoom = currentRoomsState.find(r => r.id === sourceRoom.id);
            const currentTargetRoom = currentRoomsState.find(r => r.id === targetRoom.id);
            if (!currentSourceRoom || !currentTargetRoom) return;

            const currentSourceContainer = currentSourceRoom.containers.find(c => c.id === sourceContainer.id);
            const currentTargetContainer = currentTargetRoom.containers.find(c => c.id === targetContainer.id);
            if (!currentSourceContainer || !currentTargetContainer) return;

            const currentItem = currentSourceContainer.items.find(i => i.id === item.id);
            if (!currentItem) return;

            const newLog: ItemLog = {
                id: `log-${Date.now()}-${item.id}`,
                date: new Date().toISOString(),
                action: 'TRANSFER',
                details: JSON.stringify({
                    from: `${currentSourceRoom.name} - ${currentSourceContainer.name}`,
                    to: `${currentTargetRoom.name} - ${currentTargetContainer.name}`,
                    mover: transferForm.personResponsible,
                    receiver: transferForm.receiver,
                    verifiedBy: verifierInfo,
                    statusAtMover: currentItem.status,
                    verificationStatus: 'pending'
                })
            };

            const updatedItem: Item = {
                ...currentItem,
                logs: [newLog, ...(currentItem.logs || [])]
            };

            // Remove from Source
            const updatedSourceContainerObj = {
                ...currentSourceContainer,
                items: currentSourceContainer.items.filter(i => i.id !== item.id)
            };
            const updatedSourceRoomObj = {
                ...currentSourceRoom,
                containers: currentSourceRoom.containers.map(c => c.id === sourceContainer.id ? updatedSourceContainerObj : c)
            };
            updateLocalState(updatedSourceRoomObj);

            // Add to Target
            const refreshedTargetRoom = currentRoomsState.find(r => r.id === targetRoom.id);
            const refreshedTargetContainer = refreshedTargetRoom?.containers.find(c => c.id === targetContainer.id);
            if (!refreshedTargetRoom || !refreshedTargetContainer) return;

            const updatedTargetContainerObj = {
                ...refreshedTargetContainer,
                items: [...(refreshedTargetContainer.items || []), updatedItem]
            };
            const updatedTargetRoomObj = {
                ...refreshedTargetRoom,
                containers: refreshedTargetRoom.containers.map(c => c.id === targetContainer.id ? updatedTargetContainerObj : c)
            };
            updateLocalState(updatedTargetRoomObj);
        });

        try {
            const roomsToUpdate = [targetRoom.id, ...Array.from(sourceRoomIds)];
            for (const roomId of roomsToUpdate) {
                const roomState = currentRoomsState.find((r) => r.id === roomId);
                if (roomState) await updateRoom(roomState);
            }
            setShowSuccess(`Berhasil memindahkan ${selectedItemIds.length} barang ke ${targetRoom.name} (Status: Menunggu Konfirmasi)`);
            setTimeout(() => setShowSuccess(null), 4000);

            setSelectedItemIds([]);
            setTransferForm(prev => ({ ...prev, targetRoomId: '', targetContainerId: '', personResponsible: '', receiver: '' }));
        } catch (error) {
            console.error('Failed to persist transfer:', error);
            alert('Gagal menyimpan transfer ke server.');
        }
    };

    // --- USAGE LOGIC ---
    const initiateUsage = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedItemIds.length === 0) return;
        setPendingAction('usage');
        setIsVerificationOpen(true);
    };

    const executeUsage = async (verifierInfo: string) => {
        const currentRoomsState = [...rooms];

        for (const { item, room, container } of selectedItemsData) {
            const currentRoom = currentRoomsState.find(r => r.id === room.id);
            const currentContainer = currentRoom?.containers.find(c => c.id === container.id);
            if (!currentRoom || !currentContainer) continue;

            const currentItem = currentContainer.items.find(i => i.id === item.id);
            if (!currentItem) continue;

            const isCheckout = usageForm.actionType === 'checkout';
            const actionLabel = isCheckout ? 'CHECK_OUT' : 'RETURNED';

            const newLog: ItemLog = {
                id: `log-${Date.now()}-${item.id}`,
                date: new Date().toISOString(),
                action: actionLabel,
                details: JSON.stringify({
                    borrower: usageForm.borrower,
                    purpose: usageForm.purpose,
                    verifiedBy: verifierInfo,
                    statusAtAction: isCheckout ? currentItem.status : usageForm.returnStatus,
                    returnedBy: !isCheckout ? usageForm.borrower : undefined
                })
            };

            const updatedItem: Item = {
                ...currentItem,
                status: isCheckout ? 'in_use' : usageForm.returnStatus,
                logs: [newLog, ...(currentItem.logs || [])]
            };

            const updatedContainer2 = {
                ...currentContainer,
                items: currentContainer.items.map(i => i.id === item.id ? updatedItem : i)
            };
            const updatedRoom2 = {
                ...currentRoom,
                containers: currentRoom.containers.map(c => c.id === container.id ? updatedContainer2 : c)
            };

            const roomIdx = currentRoomsState.findIndex(r => r.id === room.id);
            currentRoomsState[roomIdx] = updatedRoom2;
        }

        try {
            const affectedRoomIds = Array.from(new Set(selectedItemsData.map(s => s.room.id)));
            for (const roomId of affectedRoomIds) {
                const roomState = currentRoomsState.find(r => r.id === roomId);
                if (roomState) await updateRoom(roomState);
            }
            setShowSuccess(`Berhasil mencatat ${usageForm.actionType === 'checkout' ? 'peminjaman' : 'pengembalian'} ${selectedItemIds.length} item.`);
            setTimeout(() => setShowSuccess(null), 4000);

            // Special case: if single item returned as maintenance, open service form
            if (usageForm.actionType === 'checkin' && usageForm.returnStatus === 'maintenance' && selectedItemIds.length === 1) {
                const { item, room, container } = selectedItemsData[0];
                setServiceFormItem({ item, room, container, type: 'usage' });
            }

            setSelectedItemIds([]);
            setUsageForm(prev => ({ ...prev, borrower: '', purpose: '', returnStatus: 'good' }));
        } catch (e) {
            console.error(e);
            alert('Gagal menyimpan data penggunaan.');
        }
    };

    // --- ARRIVAL/RETURN STATUS CHECK ---
    const openArrivalCheck = (ctx: { item: Item; room: Room; container: Container; logDetails: Record<string, unknown> }, type: 'transfer' | 'usage') => {
        setArrivalCheckItem({ ...ctx, type });
        setArrivalStatus('good');
    };

    const executeArrivalCheck = async () => {
        if (!arrivalCheckItem) return;
        const { item, room, container, type } = arrivalCheckItem;

        if (arrivalStatus === 'maintenance') {
            setServiceFormItem({ item, room, container, type });
            setServiceDescription('');
            setArrivalCheckItem(null);
            return;
        }

        const currentRoom = rooms.find(r => r.id === room.id);
        const currentContainer = currentRoom?.containers.find(c => c.id === container.id);
        const currentItem = currentContainer?.items.find(i => i.id === item.id);
        if (!currentRoom || !currentContainer || !currentItem) return;

        const newStatus = arrivalStatus; // good or broken
        const actionLabel = type === 'transfer' ? 'VERIFIED_ARRIVAL' : 'VERIFIED_RETURN';
        
        const newLog: ItemLog = {
            id: `log-${Date.now()}-${item.id}`,
            date: new Date().toISOString(),
            action: actionLabel,
            details: JSON.stringify({
                note: newStatus === 'broken' ? 'Barang tiba/kembali dalam kondisi rusak.' : 'Barang tiba/kembali dalam kondisi baik.',
                statusAtArrival: newStatus
            })
        };

        const updatedLogs = currentItem.logs.map(log => {
            if (log.action === (type === 'transfer' ? 'TRANSFER' : 'CHECK_OUT')) {
                const details = parseLogDetails(log.details);
                if (type === 'transfer' && details.verificationStatus === 'pending') {
                    return { ...log, details: JSON.stringify({ ...details, verificationStatus: 'completed' }) };
                }
            }
            return log;
        });

        const updatedItem: Item = {
            ...currentItem,
            status: newStatus,
            logs: [newLog, ...updatedLogs]
        };

        const updatedContainer2 = {
            ...currentContainer,
            items: currentContainer.items.map(i => i.id === item.id ? updatedItem : i)
        };
        const updatedRoom2 = {
            ...currentRoom,
            containers: currentRoom.containers.map(c => c.id === container.id ? updatedContainer2 : c)
        };

        try {
            await updateRoom(updatedRoom2);
            setShowSuccess(`Verifikasi ${item.name} berhasil.`);
            setTimeout(() => setShowSuccess(null), 4000);
        } catch (e) {
            console.error(e);
            alert('Gagal menyimpan verifikasi.');
        }
        setArrivalCheckItem(null);
    };

    // --- SERVICE REQUEST SUBMISSION (status = maintenance) ---
    const submitServiceRequest = async () => {
        if (!serviceFormItem || !serviceDescription.trim()) return;
        const { item, room, container, type } = serviceFormItem;

        const currentRoom = rooms.find(r => r.id === room.id);
        const currentContainer = currentRoom?.containers.find(c => c.id === container.id);
        const currentItem = currentContainer?.items.find(i => i.id === item.id);
        if (!currentRoom || !currentContainer || !currentItem) return;

        try {
            await addRequest({
                componentId: item.id,
                componentName: item.name,
                stationId: container.id,
                stationName: container.name,
                roomId: room.id,
                roomName: room.name,
                description: serviceDescription.trim(),
                requesterName: user?.name || 'Unknown User',
                componentSku: item.sku,
                componentCategory: item.category,
            });

            const arrivalLog: ItemLog = {
                id: `log-${Date.now()}-${item.id}`,
                date: new Date().toISOString(),
                action: type === 'transfer' ? 'VERIFIED_ARRIVAL' : 'VERIFIED_RETURN',
                details: JSON.stringify({
                    note: 'Barang tiba/kembali dalam kondisi perlu service. Permintaan layanan dibuat.',
                    statusAtArrival: 'maintenance'
                })
            };

            const maintenanceLog: ItemLog = {
                id: `log-${Date.now()}-maint-${item.id}`,
                date: new Date().toISOString(),
                action: 'MAINTENANCE_REQUESTED',
                details: JSON.stringify({
                    description: serviceDescription.trim()
                })
            };

            const updatedLogs = currentItem.logs.map(log => {
                const details = parseLogDetails(log.details);
                if (log.action === (type === 'transfer' ? 'TRANSFER' : 'CHECK_OUT') && details.verificationStatus === 'pending') {
                    return { ...log, details: JSON.stringify({ ...details, verificationStatus: 'completed' }) };
                }
                return log;
            });

            const updatedItem: Item = {
                ...currentItem,
                status: 'maintenance',
                logs: [maintenanceLog, arrivalLog, ...updatedLogs]
            };

            const updatedContainer2 = {
                ...currentContainer,
                items: currentContainer.items.map(i => i.id === item.id ? updatedItem : i)
            };
            const updatedRoom2 = {
                ...currentRoom,
                containers: currentRoom.containers.map(c => c.id === container.id ? updatedContainer2 : c)
            };

            await updateRoom(updatedRoom2);
            setShowSuccess(`Permintaan layanan untuk ${item.name} berhasil dikirim ke Sarpras.`);
            setTimeout(() => setShowSuccess(null), 4000);
        } catch (e) {
            console.error(e);
            alert(e instanceof Error ? e.message : 'Gagal mengirim permintaan layanan.');
        }

        setServiceFormItem(null);
        setServiceDescription('');
    };

    // Find Items For Right Panel Categories
    const inUseItems: { item: Item; room: Room; container: Container }[] = [];
    const pendingItems: { item: Item; room: Room; container: Container; logDetails: Record<string, unknown> }[] = [];

    scopedRooms.forEach(room => {
        room.containers?.forEach(container => {
            container.items?.forEach(item => {
                // Category 1: In Use (Borrow/Usage)
                if (item.status === 'in_use') {
                    inUseItems.push({ item, room, container });
                }

                // Category 2: Pending Transfer
                if (item.logs && item.logs.length > 0) {
                    const latestTransferLog = item.logs.find(l => l.action === 'TRANSFER');
                    if (latestTransferLog) {
                        const details = parseLogDetails(latestTransferLog.details);
                        if (details.verificationStatus === 'pending') {
                            pendingItems.push({ item, room, container, logDetails: details });
                        }
                    }
                }
            });
        });
    });

    // Aggregated logs for history modal
    const allLogs: { item: Item; log: ItemLog }[] = [];
    rooms.forEach(room => {
        room.containers?.forEach(container => {
            container.items?.forEach(item => {
                if (item.logs) {
                    item.logs.forEach(log => {
                        allLogs.push({ item, log });
                    });
                }
            });
        });
    });
    const sortedLogs = allLogs.sort((a, b) => new Date(b.log.date).getTime() - new Date(a.log.date).getTime()).slice(0, 50);

    const handleVerificationComplete = (verifierStr: string) => {
        if (pendingAction === 'transfer') {
            executeTransfer(verifierStr);
        } else if (pendingAction === 'usage') {
            executeUsage(verifierStr);
        }
        setPendingAction(null);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 p-6">
            {showSuccess && (
                <div className="fixed top-24 right-8 bg-emerald-500 text-white px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-right z-50">
                    <CheckCircle className="h-6 w-6" />
                    <div>
                        <p className="font-bold">Berhasil</p>
                        <p className="text-emerald-100 text-sm">{showSuccess}</p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-extrabold text-[#000080] tracking-tight">Operasional</h2>
                    <p className="text-slate-500 text-sm">Transfer aset, pencatatan penggunaan, dan verifikasi.</p>
                </div>
                <button 
                    onClick={() => setIsHistoryModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all shadow-sm hover:shadow-md"
                >
                    <HistoryIcon size={18} className="text-indigo-600" />
                    Riwayat Operasional
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Kolom Kiri: Form Utama */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

                        {/* Tabs */}
                        <div className="flex border-b border-slate-100 bg-slate-50/50">
                            <button
                                onClick={() => { setActiveTab('transfer'); setSelectedItemIds([]); }}
                                className={`flex-1 py-4 text-sm font-bold transition-all relative ${activeTab === 'transfer' ? 'text-indigo-600 bg-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <ArrowRightLeft size={18} /> Pemindahan Barang
                                </div>
                                {activeTab === 'transfer' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                            </button>
                            <button
                                onClick={() => { setActiveTab('usage'); setSelectedItemIds([]); }}
                                className={`flex-1 py-4 text-sm font-bold transition-all relative ${activeTab === 'usage' ? 'text-indigo-600 bg-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <ClipboardList size={18} /> Penggunaan/Pengembalian Barang
                                </div>
                                {activeTab === 'usage' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                            </button>
                        </div>

                        <div className="p-8">
                            {/* --- TAB PEMINDAHAN BARANG --- */}
                            {activeTab === 'transfer' ? (
                                <form onSubmit={initiateTransfer} className="space-y-8">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                                            <h3 className="text-sm font-bold text-slate-800">1. Barang yang Dipindahkan</h3>
                                        </div>

                                        {selectedItemIds.length > 0 ? (
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItemsData.map(({ item }) => (
                                                        <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium group transition-all hover:border-red-200 hover:bg-red-50">
                                                            {item.name}
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${getItemStatusBadgeClasses(item.status)}`}>
                                                                {getItemStatusLabel(item.status)}
                                                            </span>
                                                            <button type="button" onClick={() => toggleItemSelection(item.id)} className="text-slate-400 group-hover:text-red-500 transition-colors">
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button type="button" onClick={() => setIsSelectionModalOpen(true)} className="inline-flex py-2 px-4 border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-sm font-bold items-center gap-2 transition-colors">
                                                    <Plus size={16} /> Ubah Pilihan Barang
                                                </button>
                                            </div>
                                        ) : (
                                            <button type="button" onClick={() => setIsSelectionModalOpen(true)} className="w-full py-8 border-2 border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all gap-2 group cursor-pointer">
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
                                                    <Plus size={20} />
                                                </div>
                                                <span className="font-bold text-sm">Pilih Barang yang Akan Dipindah</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Form Detail (disabled until items selected) */}
                                    <div className={`space-y-8 transition-opacity duration-300 ${selectedItemIds.length === 0 ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal</label>
                                                <div className="relative">
                                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                    <input type="date" required value={transferForm.date} onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700" />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pemindah</label>
                                                <div className="relative">
                                                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                    <input type="text" required value={transferForm.personResponsible} onChange={(e) => setTransferForm({ ...transferForm, personResponsible: e.target.value })} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700" placeholder="Nama Penanggung Jawab" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-4">
                                            <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                                                <ArrowRightLeft size={16} /> Detail Tujuan
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-indigo-700">Ruangan Tujuan</label>
                                                    <select required value={transferForm.targetRoomId} onChange={(e) => setTransferForm({ ...transferForm, targetRoomId: e.target.value, targetContainerId: '' })} className="w-full p-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                                                        <option value="">Pilih Ruangan Target</option>
                                                        {availableTargetRooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-semibold text-indigo-700">Kontainer (Opsional)</label>
                                                    <select disabled={!transferForm.targetRoomId} value={transferForm.targetContainerId} onChange={(e) => setTransferForm({ ...transferForm, targetContainerId: e.target.value })} className="w-full p-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50 text-sm">
                                                        <option value="">Pilih Kontainer</option>
                                                        {scopedRooms.find(r => r.id === transferForm.targetRoomId)?.containers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                    </select>
                                                </div>
                                                <div className="col-span-2 space-y-1.5">
                                                    <label className="text-xs font-semibold text-indigo-700">Penerima / PIC Baru</label>
                                                    <input type="text" required value={transferForm.receiver} onChange={(e) => setTransferForm({ ...transferForm, receiver: e.target.value })} className="w-full p-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="Nama penerima barang" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={selectedItemIds.length === 0}
                                        className={`w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex justify-center items-center gap-2 mt-4 ${selectedItemIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <ArrowRightLeft size={20} />
                                        {selectedItemIds.length > 0 ? `Pemindahan ${selectedItemIds.length} Barang` : 'Pilih Barang Terlebih Dahulu'}
                                    </button>
                                </form>
                            ) : (
                                /* --- TAB PEMINJAMAN / PENGEMBALIAN --- */
                                <form onSubmit={initiateUsage} className="space-y-8">
                                    <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
                                        <label className={`flex-1 text-center py-3 rounded-lg cursor-pointer font-bold text-sm transition-all ${usageForm.actionType === 'checkout' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                            <input type="radio" name="action" className="hidden" checked={usageForm.actionType === 'checkout'} onChange={() => { setUsageForm({ ...usageForm, actionType: 'checkout' }); setSelectedItemIds([]); }} />
                                            Barang Keluar / Pinjam
                                        </label>
                                        <label className={`flex-1 text-center py-3 rounded-lg cursor-pointer font-bold text-sm transition-all ${usageForm.actionType === 'checkin' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                            <input type="radio" name="action" className="hidden" checked={usageForm.actionType === 'checkin'} onChange={() => { setUsageForm({ ...usageForm, actionType: 'checkin' }); setSelectedItemIds([]); }} />
                                            Barang Masuk / Pengembalian
                                        </label>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                                            <h3 className="text-sm font-bold text-slate-800">1. Daftar Barang</h3>
                                        </div>

                                        {selectedItemIds.length > 0 ? (
                                            <div className="space-y-3">
                                                <div className="flex flex-col gap-2">
                                                    {selectedItemsData.map(({ item }) => (
                                                        <div key={item.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg group transition-all">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm text-slate-700 font-medium">{item.name}</span>
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${getItemStatusBadgeClasses(item.status)}`}>
                                                                    {getItemStatusLabel(item.status)}
                                                                </span>
                                                            </div>
                                                            <button type="button" onClick={() => toggleItemSelection(item.id)} className="text-slate-400 group-hover:text-red-500 transition-colors">
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button type="button" onClick={() => setIsSelectionModalOpen(true)} className="inline-flex py-2 px-4 border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-sm font-bold items-center gap-2 transition-colors">
                                                    <Plus size={16} /> Ubah Pilihan Barang
                                                </button>
                                            </div>
                                        ) : (
                                            <button type="button" onClick={() => setIsSelectionModalOpen(true)} className="w-full py-8 border-2 border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all gap-2 group cursor-pointer">
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
                                                    <Plus size={20} />
                                                </div>
                                                <span className="font-bold text-sm">Pilih Barang untuk {usageForm.actionType === 'checkout' ? 'Dipinjam' : 'Dikembalikan'}</span>
                                            </button>
                                        )}
                                    </div>

                                    <div className={`space-y-6 pt-4 border-t border-slate-100 transition-opacity duration-300 ${selectedItemIds.length === 0 ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal</label>
                                                <div className="relative">
                                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                    <input type="date" required value={usageForm.date} onChange={(e) => setUsageForm({ ...usageForm, date: e.target.value })} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700" />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{usageForm.actionType === 'checkout' ? 'Peminjam' : 'Yang Mengembalikan'}</label>
                                                <div className="relative">
                                                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                    <input type="text" required value={usageForm.borrower} onChange={(e) => setUsageForm({ ...usageForm, borrower: e.target.value })} className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700" placeholder="Nama / Kelas" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Keperluan / Keterangan</label>
                                            <textarea required value={usageForm.purpose} onChange={(e) => setUsageForm({ ...usageForm, purpose: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none font-medium text-slate-700" placeholder="Catatan opsional..." />
                                        </div>

                                        {usageForm.actionType === 'checkin' && (
                                            <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl space-y-3">
                                                <label className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-2">
                                                    <CheckCircle size={14} /> Konfirmasi Kondisi Barang Saat Kembali
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {getItemStatusOptions().filter(opt => opt.value !== 'in_use').map(opt => (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => setUsageForm({ ...usageForm, returnStatus: opt.value })}
                                                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all border ${
                                                                usageForm.returnStatus === opt.value
                                                                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md scale-105'
                                                                    : 'bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={selectedItemIds.length === 0}
                                        className={`w-full py-4 text-white rounded-xl font-bold transition-all flex justify-center items-center gap-2 mt-4 ${selectedItemIds.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : usageForm.actionType === 'checkout' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                    >
                                        <ClipboardList size={20} />
                                        {selectedItemIds.length > 0 ? (usageForm.actionType === 'checkout' ? `Pinjam ${selectedItemIds.length} Barang Keluar` : `Catat ${selectedItemIds.length} Barang Kembali`) : 'Pilih Barang Terlebih Dahulu'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>

                {/* Kolom Kanan: Aktivitas Terkini & Pemindahan */}
                <div className="lg:col-span-1 space-y-6">
                    {/* 1. Aktivitas Terkini (Borrow/In Use) */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-indigo-50 flex items-center gap-3">
                            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                                <ClipboardList size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-indigo-900">Aktivitas Terkini</h3>
                                <p className="text-xs text-indigo-700">Barang yang sedang dipinjam</p>
                            </div>
                            {inUseItems.length > 0 && (
                                <span className="ml-auto bg-indigo-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">{inUseItems.length}</span>
                            )}
                        </div>
                        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto font-sans">
                            {inUseItems.length > 0 ? (
                                inUseItems.map(({ item, room, container }) => (
                                    <div key={item.id} className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/30 shadow-sm transition-all hover:bg-white hover:border-indigo-300 group">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-slate-800 text-sm group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{item.name}</h4>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 shrink-0 ml-2">IN USE</span>
                                        </div>
                                        <div className="space-y-1 mb-3 text-xs text-slate-500">
                                            <p><span className="font-semibold text-slate-600">Lokasi:</span> {room.name} / {container.name}</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setActiveTab('usage');
                                                setUsageForm(prev => ({ ...prev, actionType: 'checkin' }));
                                                setSelectedItemIds([item.id]);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            <ClipboardList size={14} /> Kembalikan / Cek Kondisi
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-6 text-slate-400">
                                    <p className="text-sm font-medium">Tidak ada barang dipinjam.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. Pemindahan Barang (Pending Transfers) */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-amber-50 flex items-center gap-3">
                            <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                                <ArrowRightLeft size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-amber-900">Pemindahan Barang</h3>
                                <p className="text-xs text-amber-700">Dalam proses pemindahan</p>
                            </div>
                            {pendingItems.length > 0 && (
                                <span className="ml-auto bg-amber-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">{pendingItems.length}</span>
                            )}
                        </div>
                        <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                            {pendingItems.length > 0 ? (
                                pendingItems.map(({ item, room, container, logDetails }) => (
                                    <div key={item.id} className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 shadow-sm transition-all hover:bg-white hover:border-amber-400 group">
                                        <div className="flex justify-between items-start mb-3">
                                            <h4 className="font-bold text-slate-800 text-sm group-hover:text-amber-600 transition-colors uppercase tracking-tight">{item.name}</h4>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0 ml-2">PENDING</span>
                                        </div>
                                        <div className="space-y-1.5 mb-4 text-xs">
                                            <p className="text-slate-600"><span className="font-semibold">Dari:</span> {String(logDetails.from || '-')}</p>
                                            <p className="text-slate-600"><span className="font-semibold">Tujuan:</span> {room.name}</p>
                                            <div className="pt-1 text-slate-500 italic flex flex-wrap gap-x-2">
                                                <span>PIC: {String(logDetails.mover || '-')}</span>
                                                <span>Rec: {String(logDetails.receiver || '-')}</span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => openArrivalCheck({ item, room, container, logDetails }, 'transfer')}
                                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
                                        >
                                            <CheckCircle size={14} /> Konfirmasi Tiba / Cek Kondisi
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-6 text-slate-400">
                                    <p className="text-sm font-medium">Tidak ada pemindahan barang.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ============= MODALS ============= */}

            {/* Modal Pilih Barang */}
            {isSelectionModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-xl font-extrabold text-slate-800">Pilih Barang</h3>
                                <p className="text-xs text-slate-500">Cari dan pilih barang yang akan diproses</p>
                            </div>
                            <button onClick={() => setIsSelectionModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600 shadow-sm border border-transparent hover:border-slate-200">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 bg-white border-b border-slate-100">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Cari berdasarkan nama atau kode barang..."
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {filteredItems.map(({ item, room, container }) => {
                                    const isSelected = selectedItemIds.includes(item.id);
                                    // LOGIC: Block items already in use for checkout
                                    const isBlocked = activeTab === 'usage' && usageForm.actionType === 'checkout' && item.status !== 'good';

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => !isBlocked && toggleItemSelection(item.id)}
                                            className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 group relative ${isSelected ? 'border-indigo-600 bg-indigo-50/50 shadow-md' : isBlocked ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed' : 'border-slate-100 hover:border-indigo-200 hover:bg-slate-50 shadow-sm hover:shadow-md'
                                                }`}
                                        >
                                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 scale-110' : 'border-slate-300 group-hover:border-indigo-400'}`}>
                                                {isSelected && <CheckCircle size={14} className="text-white" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <h4 className="font-bold text-slate-800 text-sm truncate uppercase tracking-tight">{item.name}</h4>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase ${getItemStatusBadgeClasses(item.status)}`}>
                                                        {getItemStatusLabel(item.status)}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 font-medium">
                                                    {room.name} • {container.name}
                                                </p>
                                            </div>
                                            {isBlocked && (
                                                <div className="absolute inset-0 bg-slate-100/40 flex items-center justify-center rounded-2xl">
                                                    <span className="bg-slate-800 text-white text-[9px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                                                        <AlertTriangle size={10} /> TIDAK TERSEDIA
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                            <p className="text-sm font-bold text-slate-600">
                                {selectedItemIds.length} Barang Terpilih
                            </p>
                            <button
                                onClick={() => setIsSelectionModalOpen(false)}
                                className="px-8 py-3 bg-[#000080] hover:bg-indigo-800 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95"
                            >
                                Selesai
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Verification Modal */}
            <VerificationModal
                isOpen={isVerificationOpen}
                onClose={() => setIsVerificationOpen(false)}
                onVerify={handleVerificationComplete}
                title={pendingAction === 'transfer' ? 'Verifikasi Pemindahan' : 'Verifikasi Konfirmasi'}
                description="Masukkan Nama, Email, atau No HP Admin untuk menyetujui tindakan ini."
            />

            {/* Arrival/Return Status Modal */}
            {arrivalCheckItem && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-slate-50">
                            <h3 className="text-xl font-extrabold text-slate-800">Cek Status Barang</h3>
                            <p className="text-xs text-slate-500 mt-1">Konfirmasi kondisi aktual {arrivalCheckItem.item.name}</p>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Kondisi Saat Ini</label>
                                <div className="grid grid-cols-1 gap-3">
                                    {getItemStatusOptions().filter(o => o.value !== 'in_use').map((option) => (
                                        <button
                                            key={option.value}
                                            onClick={() => setArrivalStatus(option.value as ComponentStatus)}
                                            className={`p-4 rounded-2xl border-2 flex items-center justify-between transition-all group ${arrivalStatus === option.value
                                                    ? 'border-indigo-600 bg-indigo-50 shadow-md ring-2 ring-indigo-600/10'
                                                    : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${arrivalStatus === option.value ? 'bg-indigo-600 text-white border-2 border-indigo-400/50' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-500'}`}>
                                                    {option.value === 'good' && <CheckCircle size={20} />}
                                                    {option.value === 'maintenance' && <Wrench size={20} />}
                                                    {option.value === 'broken' && <X size={20} />}
                                                </div>
                                                <div className="text-left">
                                                    <p className={`text-sm font-extrabold ${arrivalStatus === option.value ? 'text-indigo-900' : 'text-slate-700'}`}>{option.label}</p>
                                                    <p className="text-[10px] text-slate-500 font-medium">
                                                        {option.value === 'good' && 'Barang dalam kondisi baik.'}
                                                        {option.value === 'maintenance' && 'Barang perlu direpair.'}
                                                        {option.value === 'broken' && 'Barang rusak / hilang.'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${arrivalStatus === option.value ? 'bg-indigo-600 border-indigo-600 scale-110' : 'border-slate-300'}`}>
                                                {arrivalStatus === option.value && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 flex gap-3">
                            <button onClick={() => setArrivalCheckItem(null)} className="flex-1 py-3 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold transition-all text-sm">Batal</button>
                            <button onClick={executeArrivalCheck} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all text-sm shadow-lg shadow-indigo-100">Konfirmasi</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Service Request Description Modal */}
            {serviceFormItem && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-amber-50">
                            <h3 className="text-xl font-extrabold text-amber-900 flex items-center gap-2">
                                <Wrench size={24} /> Laporkan Kerusakan
                            </h3>
                            <p className="text-xs text-amber-700 mt-1">Buat tiket permintaan servis ke Sarpras untuk {serviceFormItem.item.name}</p>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Deskripsi Kerusakan</label>
                                <textarea
                                    required
                                    value={serviceDescription}
                                    onChange={(e) => setServiceDescription(e.target.value)}
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 h-32 resize-none text-sm font-medium text-slate-700 shadow-inner"
                                    placeholder="Jelaskan detail kerusakan barang..."
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="p-6 bg-slate-50 flex gap-3">
                            <button onClick={() => setServiceFormItem(null)} className="flex-1 py-3 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold transition-all text-sm">Batal</button>
                            <button onClick={submitServiceRequest} className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all text-sm shadow-lg shadow-amber-100">Kirim Laporan</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Operational History Modal */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-end">
                    <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                                    <HistoryIcon size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-extrabold text-slate-800">Riwayat Operasional</h3>
                                    <p className="text-xs text-slate-500">50 aktivitas terbaru dari seluruh aset</p>
                                </div>
                            </div>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {sortedLogs.length > 0 ? sortedLogs.map(({ item, log }, idx) => {
                                const details = parseLogDetails(log.details);
                                return (
                                    <div key={log.id + idx} className="p-4 rounded-xl border border-slate-100 bg-white hover:border-indigo-200 transition-all space-y-2">
                                        <div className="flex justify-between items-start">
                                            <div className="space-y-0.5">
                                                <h4 className="font-bold text-slate-800 text-sm">{item.name}</h4>
                                                <p className="text-[10px] text-slate-400 font-mono">{item.sku}</p>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                                log.action === 'TRANSFER' ? 'bg-amber-100 text-amber-700' :
                                                log.action === 'CHECK_OUT' ? 'bg-indigo-100 text-indigo-700' :
                                                log.action === 'RETURNED' ? 'bg-emerald-100 text-emerald-700' :
                                                'bg-slate-100 text-slate-700'
                                            }`}>
                                                {log.action.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg space-y-1">
                                            {log.action === 'TRANSFER' && (
                                                <>
                                                    <p><span className="font-semibold">Dari:</span> {String(details.from || '-')}</p>
                                                    <p><span className="font-semibold">Ke:</span> {String(details.to || '-')}</p>
                                                </>
                                            )}
                                            {log.action === 'CHECK_OUT' && (
                                                <>
                                                    <p><span className="font-semibold">Peminjam:</span> {String(details.borrower || '-')}</p>
                                                    <p><span className="font-semibold">Tujuan:</span> {String(details.purpose || '-')}</p>
                                                </>
                                            )}
                                            {log.action === 'RETURNED' && (
                                                <>
                                                    <p><span className="font-semibold">Oleh:</span> {String(details.returnedBy || details.borrower || '-')}</p>
                                                    <p><span className="font-semibold">Status:</span> {getItemStatusLabel(details.statusAtArrival as any || 'good')}</p>
                                                </>
                                            )}
                                            <div className="flex justify-between items-center pt-1 border-t border-slate-200 mt-1 opacity-60">
                                                <span>PIC: {String(details.verifiedBy || '-') }</span>
                                                <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(log.date).toLocaleString('id-ID')}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="text-center py-20 text-slate-400">
                                    <p>Belum ada riwayat aktivitas.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
