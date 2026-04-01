const fs = require('fs');
const filepath = 'e:/pklnew/src/pages/admin/OperationsPage.tsx';

const newCode = `import { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { ArrowRightLeft, ClipboardList, Search, Calendar, User as UserIcon, Plus, CheckSquare, Square, X, AlertCircle, CheckCircle } from 'lucide-react';
import type { ComponentCondition, ComponentStatus, Room, Container, Item, ItemLog } from '../../types';
import VerificationModal from '../../components/common/VerificationModal';
import { ItemConditionBadge } from '../../components/common/ItemConditionBadge';
import { getItemConditionLabel, getItemConditionOptions } from '../../utils/itemCondition';

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

    // Verification Modal State
    const [isVerificationOpen, setIsVerificationOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<'transfer' | 'usage' | 'verify_arrival' | null>(null);
    const [arrivalItemContext, setArrivalItemContext] = useState<{item: Item, room: Room, container: Container} | null>(null);

    // Transfer UI State
    const [transferForm, setTransferForm] = useState({
        targetRoomId: '',
        targetContainerId: '',
        personResponsible: '',
        receiver: '',
        date: new Date().toISOString().split('T')[0],
        conditionBefore: 'good' as ComponentCondition
    });

    // Usage UI State
    const [usageForm, setUsageForm] = useState({
        actionType: 'checkout' as 'checkout' | 'checkin',
        borrower: '',
        date: new Date().toISOString().split('T')[0],
        purpose: '',
        conditionCheck: 'good' as ComponentCondition
    });
    const [usageQuantities, setUsageQuantities] = useState<Record<string, number>>({});

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
    
    // LOGIC: Exclude source rooms from target room options
    const sourceRoomIds = new Set(selectedItemsData.map(({ room }) => room.id));
    const availableTargetRooms = scopedRooms.filter(r => !sourceRoomIds.has(r.id));

    const filteredItems = allItems.filter(({ item, room }) => {
        // Only exclude if we already selected a targetRoom (though we changed the flow to select items first!)
        // So we just filter by text search.
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

            // 1. Create Log (status pending)
            const newLog: ItemLog = {
                id: \`log-\${Date.now()}-\${item.id}\`,
                date: new Date().toISOString(),
                action: 'TRANSFER',
                details: JSON.stringify({
                    from: \`\${currentSourceRoom.name} - \${currentSourceContainer.name}\`,
                    to: \`\${currentTargetRoom.name} - \${currentTargetContainer.name}\`,
                    mover: transferForm.personResponsible,
                    receiver: transferForm.receiver,
                    verifiedBy: verifierInfo, // Admin sending
                    condition: transferForm.conditionBefore,
                    verificationStatus: 'pending' // <-- this marks it as in-transit
                })
            };

            const updatedItem = {
                ...currentItem,
                logs: [newLog, ...(currentItem.logs || [])]
            };

            // 2. Remove from Source
            const updatedSourceContainerObj = {
                ...currentSourceContainer,
                items: currentSourceContainer.items.filter(i => i.id !== item.id)
            };
            const updatedSourceRoomObj = {
                ...currentSourceRoom,
                containers: currentSourceRoom.containers.map(c => c.id === sourceContainer.id ? updatedSourceContainerObj : c)
            };
            updateLocalState(updatedSourceRoomObj);

            // 3. Add to Target
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
            const sourceRoomIds = Array.from(new Set(selectedItemsData.map(({ room }) => room.id)));
            const prioritizedRoomIds = [targetRoom.id, ...sourceRoomIds.filter((roomId) => roomId !== targetRoom.id)];

            for (const roomId of prioritizedRoomIds) {
                const roomState = currentRoomsState.find((r) => r.id === roomId);
                if (roomState) await updateRoom(roomState);
            }
            setShowSuccess(\`Berhasil memindahkan \${selectedItemIds.length} barang ke \${targetRoom.name} (Status: Menunggu Konfirmasi)\`);
            setTimeout(() => setShowSuccess(null), 4000);
            
            // Reset state
            setSelectedItemIds([]);
            setTransferForm(prev => ({ ...prev, targetRoomId: '', targetContainerId: '', personResponsible: '', receiver: '' }));
        } catch (error) {
            console.error('Failed to persist transfer:', error);
            alert('Gagal menyimpan transfer ke server.');
        }
    };

    // --- PENDING ARRIVAL VERIFICATION LOGIC ---
    const initiateVerifyArrival = (itemCtx: {item: Item, room: Room, container: Container}) => {
        setArrivalItemContext(itemCtx);
        setPendingAction('verify_arrival');
        setIsVerificationOpen(true);
    };

    const executeVerifyArrival = async (verifierInfo: string, conditionAtArrival?: ComponentCondition) => {
        if (!arrivalItemContext) return;
        const { item, room, container } = arrivalItemContext;
        
        const currentRoom = rooms.find(r => r.id === room.id);
        const currentContainer = currentRoom?.containers.find(c => c.id === container.id);
        const currentItem = currentContainer?.items.find(i => i.id === item.id);
        if(!currentRoom || !currentContainer || !currentItem) return;

        const newLog: ItemLog = {
            id: \`log-\${Date.now()}-\${item.id}\`,
            date: new Date().toISOString(),
            action: 'VERIFIED_ARRIVAL',
            details: JSON.stringify({
                note: 'Barang telah tiba dan diverifikasi oleh admin tujuan.',
                verifier: verifierInfo,
                conditionAtArrival: conditionAtArrival || currentItem.condition
            })
        };

        const updatedItem = {
            ...currentItem,
            condition: conditionAtArrival || currentItem.condition,
            logs: [newLog, ...(currentItem.logs || [])]
        };

        const updatedContainer = {
            ...currentContainer,
            items: currentContainer.items.map(i => i.id === item.id ? updatedItem : i)
        };

        const updatedRoom = {
            ...currentRoom,
            containers: currentRoom.containers.map(c => c.id === container.id ? updatedContainer : c)
        };

        try {
            await updateRoom(updatedRoom);
            setShowSuccess(\`Konfirmasi kedatangan barang \${item.name} berhasil.\`);
            setTimeout(() => setShowSuccess(null), 3000);
        } catch(e) {
            console.error(e);
            alert("Gagal memverifikasi kedatangan barang.");
        }
    };


    // --- USAGE LOGIC (Placeholder for now) ---
    const initiateUsage = (e: React.FormEvent) => {
        e.preventDefault();
        alert('Fitur peminjaman/pengembalian (proses submit) belum diaktifkan pada langkah ini.');
    };

    // Find Pending Verification Items for Right Panel
    const pendingItems: { item: Item; room: Room; container: Container; logDetails: any }[] = [];
    scopedRooms.forEach(room => {
        room.containers?.forEach(container => {
            container.items?.forEach(item => {
                if(item.logs && item.logs.length > 0) {
                    const latestLog = item.logs[0];
                    if(latestLog.action === 'TRANSFER') {
                        const details = parseLogDetails(latestLog.details);
                        if(details.verificationStatus === 'pending') {
                            pendingItems.push({ item, room, container, logDetails: details });
                        }
                    }
                }
            });
        });
    });


    // VERIFICATION HANDLER
    const handleVerificationComplete = (verifierStr: string, condition?: ComponentCondition) => {
        if (pendingAction === 'transfer') {
            executeTransfer(verifierStr);
        } else if (pendingAction === 'verify_arrival') {
            executeVerifyArrival(verifierStr, condition);
        } else if (pendingAction === 'usage') {
            // executeUsage(verifierStr);
        }
        setPendingAction(null);
        setArrivalItemContext(null);
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
            <div>
                <h2 className="text-2xl font-extrabold text-[#000080] tracking-tight">Operasional</h2>
                <p className="text-slate-500 text-sm">Transfer aset, pencatatan penggunaan, dan verifikasi.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Kolom Kiri: Form Utama */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        
                        {/* Tabs */}
                        <div className="flex border-b border-slate-100 bg-slate-50/50">
                            <button
                                onClick={() => { setActiveTab('transfer'); setSelectedItemIds([]); }}
                                className={\`flex-1 py-4 text-sm font-bold transition-all relative \${activeTab === 'transfer' ? 'text-indigo-600 bg-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}\`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <ArrowRightLeft size={18} /> Pemindahan Barang
                                </div>
                                {activeTab === 'transfer' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                            </button>
                            <button
                                onClick={() => { setActiveTab('usage'); setSelectedItemIds([]); }}
                                className={\`flex-1 py-4 text-sm font-bold transition-all relative \${activeTab === 'usage' ? 'text-indigo-600 bg-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}\`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <ClipboardList size={18} /> Peminjaman/Pengembalian Barang
                                </div>
                                {activeTab === 'usage' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                            </button>
                        </div>

                        <div className="p-8">
                            {/* --- TAB PEMINDAHAN BARANG --- */}
                            {activeTab === 'transfer' ? (
                                <form onSubmit={initiateTransfer} className="space-y-8">
                                    {/* Tahap 1: Pilih Barang */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                                            <h3 className="text-sm font-bold text-slate-800">1. Barang yang Dipindahkan</h3>
                                        </div>
                                        
                                        {selectedItemIds.length > 0 ? (
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItemsData.map(({ item }) => (
                                                        <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium group transition-all hover:border-red-200 hover:bg-red-50">
                                                            {item.name} - {getItemConditionLabel(item.condition)}
                                                            <button type="button" onClick={() => toggleItemSelection(item.id)} className="text-slate-400 group-hover:text-red-500 transition-colors">
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsSelectionModalOpen(true)}
                                                    className="inline-flex py-2 px-4 border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-sm font-bold items-center gap-2 transition-colors"
                                                >
                                                    <Plus size={16} /> Ubah Pilihan Barang
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setIsSelectionModalOpen(true)}
                                                className="w-full py-8 border-2 border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all gap-2 group cursor-pointer"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
                                                    <Plus size={20} />
                                                </div>
                                                <span className="font-bold text-sm">Pilih Barang yang Akan Dipindah</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Tahap 2: Form Detail */}
                                    <div className={\`space-y-8 transition-opacity duration-300 \${selectedItemIds.length === 0 ? 'opacity-40 pointer-events-none' : 'opacity-100'}\`}>
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

                                        <div className="flex items-center gap-4 pt-2">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-xs font-semibold text-slate-500">Cek Kondisi Barang (Saat ini / Sebelum Pindah)</label>
                                                <select value={transferForm.conditionBefore} onChange={(e) => setTransferForm({ ...transferForm, conditionBefore: e.target.value as ComponentCondition })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                                                    {getItemConditionOptions().map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={selectedItemIds.length === 0}
                                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex justify-center items-center gap-2 mt-4 \${selectedItemIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}"
                                    >
                                        <ArrowRightLeft size={20} />
                                        {selectedItemIds.length > 0 ? \`Pemindahan \${selectedItemIds.length} Barang\` : 'Pilih Barang Terlebih Dahulu'}
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={initiateUsage} className="space-y-8">
                                    <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
                                        <label className={\`flex-1 text-center py-3 rounded-lg cursor-pointer font-bold text-sm transition-all \${usageForm.actionType === 'checkout' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}>
                                            <input type="radio" name="action" className="hidden" checked={usageForm.actionType === 'checkout'} onChange={() => { setUsageForm({ ...usageForm, actionType: 'checkout' }); setSelectedItemIds([]); }} />
                                            Barang Keluar / Pinjam
                                        </label>
                                        <label className={\`flex-1 text-center py-3 rounded-lg cursor-pointer font-bold text-sm transition-all \${usageForm.actionType === 'checkin' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}>
                                            <input type="radio" name="action" className="hidden" checked={usageForm.actionType === 'checkin'} onChange={() => { setUsageForm({ ...usageForm, actionType: 'checkin' }); setSelectedItemIds([]); }} />
                                            Barang Masuk / Pengembalian
                                        </label>
                                    </div>

                                    {/* Tahap 1: Pilih Barang */}
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
                                                                {item.isConsumable && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase">Habis Pakai</span>}
                                                            </div>
                                                            <div className="flex items-center gap-4">
                                                                <button type="button" onClick={() => toggleItemSelection(item.id)} className="text-slate-400 group-hover:text-red-500 transition-colors">
                                                                    <X size={14} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <button type="button" onClick={() => setIsSelectionModalOpen(true)} className="inline-flex py-2 px-4 border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-sm font-bold items-center gap-2 transition-colors">
                                                    <Plus size={16} /> Ubah Pilihan Barang
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setIsSelectionModalOpen(true)}
                                                className="w-full py-8 border-2 border-dashed border-indigo-200 rounded-xl flex flex-col items-center justify-center text-indigo-500 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all gap-2 group cursor-pointer"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors">
                                                    <Plus size={20} />
                                                </div>
                                                <span className="font-bold text-sm">Pilih Barang untuk {usageForm.actionType === 'checkout' ? 'Dipinjam' : 'Dikembalikan'}</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Tahap 2: Detail Form */}
                                    <div className={\`space-y-6 pt-4 border-t border-slate-100 transition-opacity duration-300 \${selectedItemIds.length === 0 ? 'opacity-40 pointer-events-none' : 'opacity-100'}\`}>
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
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={selectedItemIds.length === 0}
                                        className={\`w-full py-4 text-white rounded-xl font-bold transition-all flex justify-center items-center gap-2 mt-4 \${selectedItemIds.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed hidden' : usageForm.actionType === 'checkout' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'}\`}
                                    >
                                        <ClipboardList size={20} />
                                        {selectedItemIds.length > 0 ? (usageForm.actionType === 'checkout' ? \`Pinjam \${selectedItemIds.length} Barang Keluar\` : \`Catat \${selectedItemIds.length} Barang Kembali\`) : 'Pilih Barang Terlebih Dahulu'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>

                {/* Kolom Kanan: Aktivitas Terkini (Sementara Pending Verifications dulu) */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-amber-50 flex items-center gap-3">
                            <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                                <AlertCircle size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-amber-900">Menunggu Konfirmasi</h3>
                                <p className="text-xs text-amber-700">Barang dalam proses pemindahan</p>
                            </div>
                        </div>
                        <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                            {pendingItems.length > 0 ? (
                                pendingItems.map(({ item, room, container, logDetails }) => (
                                    <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-amber-200 transition-colors shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-slate-800 text-sm">{item.name}</h4>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">PENDING</span>
                                        </div>
                                        <div className="space-y-1 mb-4">
                                            <p className="text-xs font-semibold text-slate-600">Tujuan: {room.name}</p>
                                            <p className="text-xs text-slate-500 line-clamp-2">Dipindah oleh: {logDetails.mover || '-'}</p>
                                            <p className="text-xs text-slate-500">Penerima: {logDetails.receiver || '-'}</p>
                                        </div>
                                        <button 
                                            onClick={() => initiateVerifyArrival({item, room, container})}
                                            className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-colors"
                                        >
                                            Konfirmasi Tiba
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-8 text-slate-400">
                                    <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-sm font-medium">Tidak ada barang pending.</p>
                                    <p className="text-xs mt-1">Status semua pemindahan sudah selesai.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal Pilih Barang */}
            {isSelectionModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-800">Cari & Pilih Barang</h3>
                            <button onClick={() => setIsSelectionModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 border-b border-slate-100 bg-white">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input type="text" placeholder="Ketik nama, ID, atau ruangan..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" autoFocus />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {filteredItems.length > 0 ? (
                                filteredItems.map(({ item, room, container }) => {
                                    if (activeTab === 'usage' && usageForm.actionType === 'checkout' && item.status !== 'available') return null;
                                    if (activeTab === 'usage' && usageForm.actionType === 'checkin' && item.status !== 'in_use') return null;
                                    
                                    const isSelected = selectedItemIds.includes(item.id);
                                    return (
                                        <div key={item.id} onClick={() => toggleItemSelection(item.id)} className={\`p-4 rounded-xl flex items-center justify-between cursor-pointer border transition-colors \${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'}\`}>
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={\`shrink-0 \${isSelected ? 'text-indigo-600' : 'text-slate-300'}\`}>
                                                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                                </div>
                                                <div className="truncate">
                                                    <div className={\`font-bold text-sm \${isSelected ? 'text-indigo-900' : 'text-slate-700'}\`}>{item.name}</div>
                                                    <div className="text-xs text-slate-500">{room.name} / {container.name}</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-12 text-slate-400">Pencarian tidak menemukan apa-apa.</div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                            <span className="text-sm font-bold text-slate-500">{selectedItemIds.length} item dipilih</span>
                            <button onClick={() => setIsSelectionModalOpen(false)} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all">Selesai Memilih</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Verification Modal */}
            <VerificationModal
                isOpen={isVerificationOpen}
                onClose={() => { setIsVerificationOpen(false); setPendingAction(null); setArrivalItemContext(null); }}
                onVerify={handleVerificationComplete}
                requireConditionCheck={pendingAction === 'verify_arrival'}
                title={pendingAction === 'verify_arrival' ? 'Verifikasi Status Kedatangan' : 'Verifikasi Aksi'}
            />
        </div>
    );
}
`;

fs.writeFileSync(filepath, newCode, 'utf-8');
console.log('OperationsPage.tsx successfully updated.');
