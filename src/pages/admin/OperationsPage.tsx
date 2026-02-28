import { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ArrowRightLeft, ClipboardList, CheckCircle, Search, Calendar, User as UserIcon, AlertCircle, Plus, CheckSquare, Square, X, Clock, ArrowRight, FileDown, History } from 'lucide-react';
import type { Item, ComponentCondition, ComponentStatus, Room, Container, ItemLog } from '../../types';
import VerificationModal from '../../components/VerificationModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    const [activeTab, setActiveTab] = useState<'transfer' | 'usage'>('transfer');

    // Multi-select State
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(''); // Inside modal search

    const [showSuccess, setShowSuccess] = useState<string | null>(null);

    // Verification State
    const [isVerificationOpen, setIsVerificationOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<'transfer' | 'usage' | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // Filter Logic for Modal
    const allItems: { item: Item; room: Room; container: Container }[] = [];
    rooms.forEach(room => {
        room.containers?.forEach(container => {
            container.items?.forEach(item => {
                allItems.push({ item, room, container });
            });
        });
    });

    const filteredItems = allItems.filter(({ item }) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleItemSelection = (id: string) => {
        setSelectedItemIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const selectedItemsData = allItems.filter(i => selectedItemIds.includes(i.item.id));

    // --- Transfer Logic ---
    const [transferForm, setTransferForm] = useState({
        targetRoomId: '',
        targetContainerId: '',
        personResponsible: '',
        receiver: '', // New PIC
        date: new Date().toISOString().split('T')[0],
        conditionBefore: 'good' as ComponentCondition
    });

    const initiateTransfer = (e: React.FormEvent) => {
        e.preventDefault();

        if (selectedItemIds.length === 0) {
            alert("Please select at least one item.");
            return;
        }

        if (!transferForm.targetRoomId || !transferForm.targetContainerId) {
            alert("Please select a valid destination.");
            return;
        }

        const targetRoom = rooms.find(r => r.id === transferForm.targetRoomId);
        const targetContainer = targetRoom?.containers.find(c => c.id === transferForm.targetContainerId);

        if (!targetRoom || !targetContainer) return;

        setPendingAction('transfer');
        setIsVerificationOpen(true);
    };

    const executeTransfer = async (verifierInfo: string) => {
        const targetRoom = rooms.find(r => r.id === transferForm.targetRoomId);
        const targetContainer = targetRoom?.containers.find(c => c.id === transferForm.targetContainerId);

        if (!targetRoom || !targetContainer) return;

        // Process each item
        // We need to be careful about state updates in a loop.
        // Better strategy: Calculate new state for ALL affected rooms and update once or carefully.
        // Given existing context API, let's try to batch the logic by cloning the rooms array first.

        const currentRoomsState = [...rooms];

        // We need a helper to find room/container index in the LOCAL currentRoomsState
        const updateLocalState = (updatedRoom: Room) => {
            const idx = currentRoomsState.findIndex(r => r.id === updatedRoom.id);
            if (idx !== -1) currentRoomsState[idx] = updatedRoom;
        };

        selectedItemsData.forEach(({ item, room: sourceRoom, container: sourceContainer }) => {
            // Re-fetch objects from currentRoomsState to ensure we have latest version during the loop
            const currentSourceRoom = currentRoomsState.find(r => r.id === sourceRoom.id);
            const currentTargetRoom = currentRoomsState.find(r => r.id === targetRoom.id);
            if (!currentSourceRoom || !currentTargetRoom) {
                return;
            }

            const currentSourceContainer = currentSourceRoom.containers.find(c => c.id === sourceContainer.id);
            const currentTargetContainer = currentTargetRoom.containers.find(c => c.id === targetContainer.id);
            if (!currentSourceContainer || !currentTargetContainer) {
                return;
            }

            const currentItem = currentSourceContainer.items.find(i => i.id === item.id);
            if (!currentItem) {
                return;
            }

            // 1. Create Log
            const newLog: ItemLog = {
                id: `log-${Date.now()}-${item.id}`,
                date: new Date().toISOString(),
                action: 'TRANSFER',
                details: JSON.stringify({
                    from: `${currentSourceRoom.name} - ${currentSourceContainer.name}`,
                    to: `${currentTargetRoom.name} - ${currentTargetContainer.name}`,
                    mover: transferForm.personResponsible,
                    receiver: transferForm.receiver, // New PIC
                    verifiedBy: verifierInfo, // Added verification
                    condition: transferForm.conditionBefore,
                    verificationStatus: 'pending' // Pending confirmation
                })
            };

            const updatedItem = {
                ...currentItem,
                condition: transferForm.conditionBefore, // Update to the stated condition before transfer (usually same)
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
            // Re-fetch target room from state (it might be same as source room!)
            const refreshedTargetRoom = currentRoomsState.find(r => r.id === targetRoom.id);
            if (!refreshedTargetRoom) {
                return;
            }
            const refreshedTargetContainer = refreshedTargetRoom.containers.find(c => c.id === targetContainer.id);
            if (!refreshedTargetContainer) {
                return;
            }

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
            await Promise.all(currentRoomsState.map((roomState) => updateRoom(roomState)));
            setShowSuccess(`Successfully moved ${selectedItemIds.length} items to ${targetRoom.name}`);
            setTimeout(() => setShowSuccess(null), 3000);
            setSelectedItemIds([]);
            setSearchTerm('');
        } catch (error) {
            console.error('Failed to persist transfer:', error);
            alert(error instanceof Error ? error.message : 'Failed to save transfer into backend.');
        }
    };

    // --- Usage Logic ---
    const [usageForm, setUsageForm] = useState({
        actionType: 'checkout' as 'checkout' | 'checkin',
        borrower: '',
        date: new Date().toISOString().split('T')[0],
        purpose: '',
        conditionCheck: 'good' as ComponentCondition
    });

    const initiateUsage = (e: React.FormEvent) => {
        e.preventDefault();

        if (selectedItemIds.length === 0) {
            alert("Please select at least one item.");
            return;
        }

        // Validation Batch
        const invalidItems = selectedItemsData.filter(({ item }) => {
            if (usageForm.actionType === 'checkout') return item.status !== 'available';
            if (usageForm.actionType === 'checkin') return item.status !== 'in_use';
            return false;
        });

        if (invalidItems.length > 0) {
            alert(`Some items cannot be processed:\n${invalidItems.map(i => i.item.name).join(', ')}\n\nCheck their current status.`);
            return;
        }

        setPendingAction('usage');
        setIsVerificationOpen(true);
    };

    const executeUsage = async (verifierInfo: string) => {
        const currentRoomsState = [...rooms];
        const updateLocalState = (updatedRoom: Room) => {
            const idx = currentRoomsState.findIndex(r => r.id === updatedRoom.id);
            if (idx !== -1) currentRoomsState[idx] = updatedRoom;
        };

        selectedItemsData.forEach(({ item, room: itemRoom, container: itemContainer }) => {
            const currentRoom = currentRoomsState.find(r => r.id === itemRoom.id);
            if (!currentRoom) {
                return;
            }
            const currentContainer = currentRoom.containers.find(c => c.id === itemContainer.id);
            if (!currentContainer) {
                return;
            }
            const currentItem = currentContainer.items.find(i => i.id === item.id);
            if (!currentItem) {
                return;
            }

            // 1. Create Log
            const newLog: ItemLog = {
                id: `log-${Date.now()}-${item.id}`,
                date: new Date().toISOString(),
                action: usageForm.actionType === 'checkout' ? 'CHECK_OUT' : 'RETURNED',
                details: JSON.stringify({
                    borrower: usageForm.borrower,
                    purpose: usageForm.purpose,
                    verifiedBy: verifierInfo,
                    condition: usageForm.conditionCheck
                })
            };

            // 2. Update Item
            const updatedItem = {
                ...currentItem,
                status: (usageForm.actionType === 'checkout' ? 'in_use' : 'available') as ComponentStatus,
                condition: usageForm.actionType === 'checkin' ? usageForm.conditionCheck : currentItem.condition,
                logs: [newLog, ...(currentItem.logs || [])]
            };

            // 3. Save
            const updatedContainerObj = {
                ...currentContainer,
                items: currentContainer.items.map(i => i.id === item.id ? updatedItem : i)
            };
            const updatedRoomObj = {
                ...currentRoom,
                containers: currentRoom.containers.map(c => c.id === itemContainer.id ? updatedContainerObj : c)
            };
            updateLocalState(updatedRoomObj);
        });

        try {
            await Promise.all(currentRoomsState.map((roomState) => updateRoom(roomState)));
            setShowSuccess(`Successfully ${usageForm.actionType === 'checkout' ? 'checked out' : 'returned'} ${selectedItemIds.length} items`);
            setTimeout(() => setShowSuccess(null), 3000);
            setSelectedItemIds([]);
            setSearchTerm('');
        } catch (error) {
            console.error('Failed to persist usage operation:', error);
            alert(error instanceof Error ? error.message : 'Failed to save usage operation into backend.');
        }
    };

    // --- Export PDF Logic ---
    const handleExportPDF = () => {
        const doc = new jsPDF('landscape', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        const now = new Date();
        const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        // Header
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('LAPORAN OPERASIONAL', pageWidth / 2, 18, { align: 'center' });
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text('SMPK SANTA MARIA 2 MALANG — Portal Inventory', pageWidth / 2, 25, { align: 'center' });
        doc.setFontSize(9);
        doc.setTextColor(120);
        doc.text(`Dicetak: ${dateStr}, ${timeStr}`, pageWidth / 2, 31, { align: 'center' });
        doc.setTextColor(0);

        // Separator Line
        doc.setDrawColor(0, 0, 128);
        doc.setLineWidth(0.5);
        doc.line(14, 34, pageWidth - 14, 34);

        let startY = 40;

        // Collect all operations logs
        const allLogs: { item: Item; room: Room; container: Container; log: ItemLog }[] = [];
        rooms.forEach(room => {
            room.containers?.forEach(container => {
                container.items?.forEach(item => {
                    item.logs?.forEach(log => {
                        if (['TRANSFER', 'CHECK_OUT', 'RETURNED'].includes(log.action)) {
                            allLogs.push({ item, room, container, log });
                        }
                    });
                });
            });
        });

        // Sort by date descending
        allLogs.sort((a, b) => new Date(b.log.date).getTime() - new Date(a.log.date).getTime());

        const transferLogs = allLogs.filter(l => l.log.action === 'TRANSFER');
        const usageLogs = allLogs.filter(l => l.log.action === 'CHECK_OUT' || l.log.action === 'RETURNED');

        // --- TRANSFER TABLE ---
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Riwayat Transfer Aset', 14, startY);
        startY += 2;

        if (transferLogs.length > 0) {
            autoTable(doc, {
                startY: startY,
                head: [['No', 'Tanggal', 'Nama Aset', 'Dari', 'Ke', 'Pemindah', 'Penerima', 'Kondisi', 'Status']],
                body: transferLogs.map((entry, idx) => {
                    const d = parseLogDetails(entry.log.details);
                    return [
                        String(idx + 1),
                        new Date(entry.log.date).toLocaleDateString('id-ID'),
                        entry.item.name,
                        String(d.from ?? '-'),
                        String(d.to ?? '-'),
                        String(d.mover ?? '-'),
                        String(d.receiver ?? '-'),
                        String(d.condition ?? '-'),
                        String(d.verificationStatus ?? '-').toUpperCase(),
                    ];
                }),
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [0, 0, 128], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 247, 250] },
                margin: { left: 14, right: 14 },
            });
            startY = (doc as any).lastAutoTable.finalY + 10;
        } else {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.text('Belum ada riwayat transfer.', 14, startY + 6);
            startY += 14;
        }

        // --- USAGE TABLE ---
        // Check if we need a new page
        if (startY > doc.internal.pageSize.getHeight() - 40) {
            doc.addPage();
            startY = 18;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Riwayat Penggunaan Aset', 14, startY);
        startY += 2;

        if (usageLogs.length > 0) {
            autoTable(doc, {
                startY: startY,
                head: [['No', 'Tanggal', 'Aksi', 'Nama Aset', 'Ruangan', 'Peminjam', 'Keperluan', 'Kondisi']],
                body: usageLogs.map((entry, idx) => {
                    const d = parseLogDetails(entry.log.details);
                    return [
                        String(idx + 1),
                        new Date(entry.log.date).toLocaleDateString('id-ID'),
                        entry.log.action === 'CHECK_OUT' ? 'Pinjam' : 'Kembali',
                        entry.item.name,
                        entry.room.name,
                        String(d.borrower ?? '-'),
                        String(d.purpose ?? '-'),
                        String(d.condition ?? '-'),
                    ];
                }),
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [0, 0, 128], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 247, 250] },
                margin: { left: 14, right: 14 },
            });
        } else {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'italic');
            doc.text('Belum ada riwayat penggunaan.', 14, startY + 6);
        }

        // Footer on all pages
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
            doc.text('Portal Inventory — SMPK Santa Maria 2 Malang', 14, doc.internal.pageSize.getHeight() - 8);
        }

        doc.save(`Laporan_Operasional_${now.toISOString().slice(0, 10)}.pdf`);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8">

            {showSuccess && (
                <div className="fixed top-24 right-8 bg-emerald-500 text-white px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-right z-50">
                    <CheckCircle className="h-6 w-6" />
                    <div>
                        <p className="font-bold">Success</p>
                        <p className="text-emerald-100 text-sm">{showSuccess}</p>
                    </div>
                </div>
            )}

            {/* Page Header with Export Button */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-extrabold text-[#000080] tracking-tight">Operasional</h2>
                    <p className="text-slate-500 text-sm">Transfer aset, pencatatan penggunaan, dan verifikasi.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setIsHistoryOpen(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all text-sm"
                    >
                        <History size={18} />
                        Riwayat Operasional
                    </button>
                    <button
                        onClick={handleExportPDF}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#000080] text-white rounded-xl font-bold shadow-md shadow-blue-900/10 hover:bg-[#000060] transition-all text-sm"
                    >
                        <FileDown size={18} />
                        Export PDF
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Col: Operation Form */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {/* Header Tabs */}
                        <div className="flex border-b border-slate-100 bg-slate-50/50">
                            <button
                                onClick={() => setActiveTab('transfer')}
                                className={`flex-1 py-4 text-sm font-bold transition-all relative ${activeTab === 'transfer' ? 'text-indigo-600 bg-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <ArrowRightLeft size={18} /> Transfer Asset
                                </div>
                                {activeTab === 'transfer' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                            </button>
                            <button
                                onClick={() => setActiveTab('usage')}
                                className={`flex-1 py-4 text-sm font-bold transition-all relative ${activeTab === 'usage' ? 'text-indigo-600 bg-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <ClipboardList size={18} /> Record Usage
                                </div>
                                {activeTab === 'usage' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600" />}
                            </button>
                        </div>

                        <div className="p-8">
                            {activeTab === 'transfer' ? (
                                <form onSubmit={initiateTransfer} className="space-y-8">
                                    {/* logistics */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date</label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <input
                                                    type="date"
                                                    required
                                                    value={transferForm.date}
                                                    onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
                                                    className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mover</label>
                                            <div className="relative">
                                                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <input
                                                    type="text"
                                                    required
                                                    value={transferForm.personResponsible}
                                                    onChange={(e) => setTransferForm({ ...transferForm, personResponsible: e.target.value })}
                                                    className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                                                    placeholder="Person Responsible"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Destination */}
                                    <div className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-4">
                                        <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                                            <ArrowRightLeft size={16} /> Destination Details
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-indigo-700">Target Room</label>
                                                <select
                                                    required
                                                    value={transferForm.targetRoomId}
                                                    onChange={(e) => setTransferForm({ ...transferForm, targetRoomId: e.target.value, targetContainerId: '' })}
                                                    className="w-full p-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                                >
                                                    <option value="">Select Room</option>
                                                    {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-semibold text-indigo-700">Container (Opt)</label>
                                                <select
                                                    disabled={!transferForm.targetRoomId}
                                                    value={transferForm.targetContainerId}
                                                    onChange={(e) => setTransferForm({ ...transferForm, targetContainerId: e.target.value })}
                                                    className="w-full p-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50 text-sm"
                                                >
                                                    <option value="">Select Container</option>
                                                    {rooms.find(r => r.id === transferForm.targetRoomId)?.containers.map(c => (
                                                        <option key={c.id} value={c.id}>{c.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-2 space-y-1.5">
                                                <label className="text-xs font-semibold text-indigo-700">Receiver / New PIC</label>
                                                <input
                                                    type="text"
                                                    required
                                                    value={transferForm.receiver}
                                                    onChange={(e) => setTransferForm({ ...transferForm, receiver: e.target.value })}
                                                    className="w-full p-3 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                                    placeholder="Who is receiving this?"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Condition & Items */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assets to Transfer</label>
                                            {selectedItemIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsSelectionModalOpen(true)}
                                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                                                >
                                                    + Add More
                                                </button>
                                            )}
                                        </div>

                                        {selectedItemIds.length > 0 ? (
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItemsData.map(({ item }) => (
                                                        <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium group transition-all hover:border-red-200 hover:bg-red-50">
                                                            {item.name}
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleItemSelection(item.id)}
                                                                className="text-slate-400 group-hover:text-red-500 transition-colors"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-4 pt-2">
                                                    <div className="flex-1 space-y-1">
                                                        <label className="text-xs font-semibold text-slate-500">Condition Check (Before Transfer)</label>
                                                        <select
                                                            value={transferForm.conditionBefore}
                                                            onChange={(e) => setTransferForm({ ...transferForm, conditionBefore: e.target.value as ComponentCondition })}
                                                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                                                        >
                                                            <option value="good">Good</option>
                                                            <option value="service">Service</option>
                                                            <option value="damaged">Damaged</option>
                                                            <option value="broken">Broken</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setIsSelectionModalOpen(true)}
                                                className="w-full py-8 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all gap-2 group"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-indigo-100/50 flex items-center justify-center transition-colors">
                                                    <Plus size={20} />
                                                </div>
                                                <span className="font-medium text-sm">Select Items to Transfer</span>
                                            </button>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={selectedItemIds.length === 0}
                                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex justify-center items-center gap-2 mt-4"
                                    >
                                        <ArrowRightLeft size={20} />
                                        {selectedItemIds.length > 0 ? `Transfer ${selectedItemIds.length} Assets` : 'Select Assets First'}
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={initiateUsage} className="space-y-8">
                                    {/* Action Type Toggle */}
                                    <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
                                        <label className={`flex-1 text-center py-2.5 rounded-lg cursor-pointer font-bold text-sm transition-all ${usageForm.actionType === 'checkout' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                            <input type="radio" name="action" className="hidden"
                                                checked={usageForm.actionType === 'checkout'}
                                                onChange={() => setUsageForm({ ...usageForm, actionType: 'checkout' })}
                                            />
                                            Check Out
                                        </label>
                                        <label className={`flex-1 text-center py-2.5 rounded-lg cursor-pointer font-bold text-sm transition-all ${usageForm.actionType === 'checkin' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                            <input type="radio" name="action" className="hidden"
                                                checked={usageForm.actionType === 'checkin'}
                                                onChange={() => setUsageForm({ ...usageForm, actionType: 'checkin' })}
                                            />
                                            Return
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date</label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <input
                                                    type="date"
                                                    required
                                                    value={usageForm.date}
                                                    onChange={(e) => setUsageForm({ ...usageForm, date: e.target.value })}
                                                    className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Borrower</label>
                                            <div className="relative">
                                                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                                <input
                                                    type="text"
                                                    required
                                                    value={usageForm.borrower}
                                                    onChange={(e) => setUsageForm({ ...usageForm, borrower: e.target.value })}
                                                    className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                                                    placeholder="Name / Class"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Purpose</label>
                                        <textarea
                                            required
                                            value={usageForm.purpose}
                                            onChange={(e) => setUsageForm({ ...usageForm, purpose: e.target.value })}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none font-medium text-slate-700"
                                            placeholder="Activity description..."
                                        />
                                    </div>

                                    {/* Assets Section */}
                                    <div className="space-y-4 pt-2">
                                        <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Affected Assets</label>
                                            {selectedItemIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsSelectionModalOpen(true)}
                                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                                                >
                                                    + Add More
                                                </button>
                                            )}
                                        </div>

                                        {selectedItemIds.length > 0 ? (
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItemsData.map(({ item }) => (
                                                        <div key={item.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 font-medium group transition-all hover:border-red-200 hover:bg-red-50">
                                                            {item.name}
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleItemSelection(item.id)}
                                                                className="text-slate-400 group-hover:text-red-500 transition-colors"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>

                                                {usageForm.actionType === 'checkin' && (
                                                    <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl space-y-2 animate-in fade-in">
                                                        <label className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                                                            <AlertCircle size={16} /> Return Condition Check
                                                        </label>
                                                        <select
                                                            value={usageForm.conditionCheck}
                                                            onChange={(e) => setUsageForm({ ...usageForm, conditionCheck: e.target.value as ComponentCondition })}
                                                            className="w-full p-2.5 bg-white border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                                                        >
                                                            <option value="good">Good (No new damage)</option>
                                                            <option value="service">Service Needed</option>
                                                            <option value="damaged">Damaged</option>
                                                            <option value="broken">Broken</option>
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setIsSelectionModalOpen(true)}
                                                className="w-full py-8 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all gap-2 group"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-indigo-100/50 flex items-center justify-center transition-colors">
                                                    <Plus size={20} />
                                                </div>
                                                <span className="font-medium text-sm">Select Assets to {usageForm.actionType === 'checkout' ? 'Check Out' : 'Return'}</span>
                                            </button>
                                        )}
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={selectedItemIds.length === 0}
                                        className={`w-full py-4 text-white rounded-xl font-bold shadow-lg transition-all flex justify-center items-center gap-2 ${usageForm.actionType === 'checkout' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'} disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed`}
                                    >
                                        <ClipboardList size={20} />
                                        {selectedItemIds.length > 0 ? (usageForm.actionType === 'checkout' ? `Check Out ${selectedItemIds.length} Items` : `Return ${selectedItemIds.length} Items`) : 'Select Assets First'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Col: Recent Activity */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sticky top-6">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <ClipboardList size={18} className="text-indigo-500" /> Recent Activity
                        </h3>

                        {/* Tracker for Active Loans */}
                        <ActiveLoans onReturn={(itemId) => {
                            setUsageForm(prev => ({ ...prev, actionType: 'checkin' }));
                            setSelectedItemIds([itemId]);
                            setActiveTab('usage');
                        }} />

                        <PendingVerifications />

                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">
                            <Clock size={32} className="mx-auto text-slate-300 mb-3" />
                            <p className="text-sm text-slate-500 font-medium">Buka <b className="text-slate-700">Riwayat Operasional</b> untuk melihat detail histori dan filter data secara lengkap.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Selection Modal */}
            {isSelectionModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-lg font-bold text-gray-800">Select Items</h3>
                            <button onClick={() => setIsSelectionModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search by name, ID, or room..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {filteredItems.length > 0 ? (
                                filteredItems.map(({ item, room, container }) => {
                                    const isSelected = selectedItemIds.includes(item.id);
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => toggleItemSelection(item.id)}
                                            className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`shrink-0 ${isSelected ? 'text-indigo-600' : 'text-gray-300'}`}>
                                                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                                </div>
                                                <div className="truncate">
                                                    <div className={`font-medium ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>{item.name}</div>
                                                    <div className="text-xs text-gray-500 flex items-center gap-2">
                                                        <span className="capitalize px-1.5 py-0.5 rounded bg-gray-100">{item.condition}</span>
                                                        <span className="text-gray-400">•</span>
                                                        <span>{room.name} / {container.name}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className={`text-xs px-2 py-1 rounded-full font-bold uppercase ${item.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                                                item.status === 'in_use' ? 'bg-amber-100 text-amber-700' :
                                                    'bg-red-100 text-red-700'
                                                }`}>
                                                {item.status.replace('_', ' ')}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-12 text-gray-400">
                                    <Search size={48} className="mx-auto mb-2 opacity-20" />
                                    <p>No items found matching "{searchTerm}"</p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-500">
                                {selectedItemIds.length} items selected
                            </span>
                            <button
                                onClick={() => setIsSelectionModalOpen(false)}
                                className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-lg shadow-indigo-200 hover:bg-indigo-500 transition-all active:scale-95"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <VerificationModal
                isOpen={isVerificationOpen}
                onClose={() => {
                    setIsVerificationOpen(false);
                    setPendingAction(null);
                }}
                onVerify={(info) => {
                    if (pendingAction === 'transfer') void executeTransfer(info);
                    if (pendingAction === 'usage') void executeUsage(info);
                }}
                title="Verifikasi Transaksi"
                description="Masukkan nama lengkap, nomor HP, atau email untuk memverifikasi transaksi ini."
            />

            <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
        </div>
    );
}



// Active Loans Component
function ActiveLoans({ onReturn }: { onReturn: (itemId: string) => void }) {
    const { rooms } = useInventory();

    // Find all items in use
    const activeItems = rooms.flatMap(room =>
        room.containers?.flatMap(container =>
            container.items?.filter(item => item.status === 'in_use')
                .map(item => ({ item, roomName: room.name })) || []
        ) || []
    );

    if (activeItems.length === 0) return null;

    return (
        <div className="mb-8 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
            <h3 className="font-bold text-indigo-800 mb-2 flex items-center gap-2">
                <Clock size={18} /> Currently In Use
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {activeItems.map(({ item, roomName }) => (
                    <div key={item.id} className="bg-white p-3 rounded-lg border border-indigo-100 flex justify-between items-center shadow-sm">
                        <div className="overflow-hidden">
                            <div className="font-bold text-slate-700 text-sm truncate">{item.name}</div>
                            <div className="text-xs text-slate-500 truncate">From: {roomName}</div>
                        </div>
                        <button
                            onClick={() => onReturn(item.id)}
                            className="shrink-0 px-3 py-1.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1"
                        >
                            Return <ArrowRight size={12} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Define PendingVerifications Helper Component
function PendingVerifications() {
    const { recentLogs, rooms, updateRoom } = useInventory();
    const [verifyingLog, setVerifyingLog] = useState<{ roomName: string, itemName: string, log: ItemLog } | null>(null);

    const pendingLogs = recentLogs.filter(entry => {
        const details = parseLogDetails(entry.log.details);
        return entry.log.action === 'TRANSFER' && details.verificationStatus === 'pending';
    });

    const handleConfirm = async (condition: ComponentCondition) => {
        if (!verifyingLog) return;

        const targetLogEntry = verifyingLog;

        let found = false;
        // Need to loop rooms to find the item that has THIS log id
        const newRooms = rooms.map(room => ({
            ...room,
            containers: room.containers?.map(container => ({
                ...container,
                items: container.items?.map(item => {
                    const logIndex = item.logs?.findIndex(l => l.id === targetLogEntry.log.id);
                    if (logIndex !== undefined && logIndex !== -1) {
                        found = true;
                        // Update Log
                        const updatedLogs = [...item.logs];
                        const oldDetails = parseLogDetails(updatedLogs[logIndex].details);
                        updatedLogs[logIndex] = {
                            ...updatedLogs[logIndex],
                            details: JSON.stringify({
                                ...oldDetails,
                                verificationStatus: 'verified',
                                verifiedAt: new Date().toISOString(),
                                conditionAfter: condition
                            })
                        };

                        return {
                            ...item,
                            condition: condition, // Update item condition based on verification
                            logs: updatedLogs
                        };
                    }
                    return item;
                }) || []
            })) || []
        }));

        if (found) {
            try {
                await Promise.all(newRooms.map((roomState) => updateRoom(roomState)));
                setVerifyingLog(null);
            } catch (error) {
                console.error('Failed to persist verification update:', error);
            }
        }
    };

    if (pendingLogs.length === 0) return null;

    return (
        <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                <AlertCircle size={18} /> Pending Confirmations
            </h3>
            <div className="space-y-2">
                {pendingLogs.map((entry) => (
                    <div key={entry.log.id} className="bg-white p-3 rounded-lg border border-amber-100 flex justify-between items-center shadow-sm">
                        <div>
                            <div className="font-bold text-slate-700 text-sm">{entry.itemName}</div>
                            <div className="text-xs text-slate-500">
                                To: {String(parseLogDetails(entry.log.details).to ?? '-')}
                            </div>
                        </div>
                        <button
                            onClick={() => setVerifyingLog(entry)}
                            className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg hover:bg-amber-200 transition-colors"
                        >
                            Verify
                        </button>
                    </div>
                ))}
            </div>

            {/* Verification Modal */}
            {verifyingLog && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm animate-in zoom-in-95">
                        <h3 className="font-bold text-lg mb-4">Confirm Item Condition</h3>
                        <p className="text-sm text-slate-500 mb-6">
                            How is the condition of <b>{verifyingLog.itemName}</b> after arrival?
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => { void handleConfirm('good'); }} className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100">Good</button>
                            <button onClick={() => { void handleConfirm('service'); }} className="p-3 bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded-xl hover:bg-amber-100">Service</button>
                            <button onClick={() => { void handleConfirm('damaged'); }} className="p-3 bg-orange-50 border border-orange-200 text-orange-700 font-bold rounded-xl hover:bg-orange-100">Damaged</button>
                            <button onClick={() => { void handleConfirm('broken'); }} className="p-3 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-xl hover:bg-rose-100">Broken</button>
                        </div>
                        <button onClick={() => setVerifyingLog(null)} className="w-full mt-4 py-2 text-slate-400 font-bold text-sm hover:text-slate-600">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------
// HistoryModal Component
// ---------------------------------------------------------
function HistoryModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { recentLogs } = useInventory();
    const [filterType, setFilterType] = useState<'ALL' | 'TRANSFER' | 'CHECK_OUT' | 'RETURNED'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLog, setSelectedLog] = useState<{ entry: (typeof recentLogs)[0]; details: Record<string, unknown> } | null>(null);

    const filteredLogs = recentLogs.filter(entry => {
        if (filterType !== 'ALL' && entry.log.action !== filterType) return false;
        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            const d = parseLogDetails(entry.log.details);
            if (
                !entry.itemName.toLowerCase().includes(s) &&
                !String(d.mover ?? '').toLowerCase().includes(s) &&
                !String(d.borrower ?? '').toLowerCase().includes(s)
            ) return false;
        }
        return true;
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg"><History size={20} /></div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800">Riwayat Operasional</h3>
                            <p className="text-xs text-slate-500">Log peminjaman, pengembalian, dan transfer aset.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                </div>

                {/* Filters */}
                <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex gap-2">
                        {(['ALL', 'TRANSFER', 'CHECK_OUT', 'RETURNED'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setFilterType(type)}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors border ${filterType === type
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                            >
                                {type === 'ALL' ? 'Semua' : type === 'CHECK_OUT' ? 'Peminjaman' : type === 'RETURNED' ? 'Pengembalian' : 'Transfer'}
                            </button>
                        ))}
                    </div>
                    <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text" placeholder="Cari item, nama..." value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    <div className="space-y-3">
                        {filteredLogs.length > 0 ? filteredLogs.map((entry, idx) => {
                            const details = parseLogDetails(entry.log.details);
                            return (
                                <div key={idx} onClick={() => setSelectedLog({ entry, details })} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center gap-4 cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all group">
                                    <div className={`w-3 h-3 rounded-full shrink-0 ${entry.log.action === 'TRANSFER' ? 'bg-amber-400' :
                                        entry.log.action === 'CHECK_OUT' ? 'bg-indigo-400' :
                                            entry.log.action === 'RETURNED' ? 'bg-emerald-400' : 'bg-slate-300'
                                        }`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-slate-800 flex items-center gap-2">
                                            <span className="truncate">{entry.itemName}</span>
                                            <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-semibold uppercase shrink-0">
                                                {entry.log.action.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <div className="text-sm text-slate-500 mt-1 line-clamp-1">
                                            {entry.log.action === 'TRANSFER' && `Dari ${String(details.from || '-')} ke ${String(details.to || '-')}`}
                                            {entry.log.action === 'CHECK_OUT' && `Peminjam: ${String(details.borrower || '-')} \u2014 ${String(details.purpose || '-')}`}
                                            {entry.log.action === 'RETURNED' && `Dikembalikan oleh: ${String(details.returner || '-')} (Kondisi: ${String(details.condition || '-')})`}
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-xs font-bold text-slate-600">{new Date(entry.log.date).toLocaleDateString()}</div>
                                        <div className="text-xs text-slate-400">{new Date(entry.log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                    <ArrowRight size={20} className="text-slate-300 group-hover:text-indigo-500 ml-2 transition-colors shrink-0" />
                                </div>
                            );
                        }) : (
                            <div className="text-center py-12">
                                <History className="mx-auto text-slate-300 mb-3" size={48} />
                                <p className="text-slate-500 font-medium">Belum ada riwayat operasi yang cocok dengan filter.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Detail Popup */}
            {selectedLog && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800">Detail Aktivitas</h3>
                                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">{selectedLog.entry.log.action.replace('_', ' ')}</p>
                            </div>
                            <button onClick={() => setSelectedLog(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="text-xs text-slate-400 font-bold uppercase mb-1">Item</div>
                                <div className="font-bold text-slate-700">{selectedLog.entry.itemName}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-slate-400 font-bold uppercase mb-1">Tanggal</div>
                                    <div className="text-sm font-medium text-slate-600">{new Date(selectedLog.entry.log.date).toLocaleDateString()}</div>
                                </div>
                                {selectedLog.entry.log.action === 'TRANSFER' && (
                                    <>
                                        <div className="col-span-2">
                                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Perpindahan</div>
                                            <div className="text-sm text-slate-600 p-2 bg-slate-50 rounded-lg">
                                                <div className="flex justify-between border-b border-slate-200 pb-1 mb-1"><span>Dari:</span> <span className="font-bold">{String(selectedLog.details.from)}</span></div>
                                                <div className="flex justify-between"><span>Ke:</span> <span className="font-bold">{String(selectedLog.details.to)}</span></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Pemindah</div>
                                            <div className="text-sm font-bold text-slate-600">{String(selectedLog.details.mover || '-')}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Penerima</div>
                                            <div className="text-sm font-bold text-slate-600">{String(selectedLog.details.receiver || '-')}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Status Verifikasi</div>
                                            <div className={`text-[10px] font-bold px-2 py-1 rounded inline-block ${selectedLog.details.verificationStatus === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                {String(selectedLog.details.verificationStatus || 'UNVERIFIED').toString().toUpperCase()}
                                            </div>
                                        </div>
                                    </>
                                )}
                                {selectedLog.entry.log.action === 'CHECK_OUT' && (
                                    <>
                                        <div className="col-span-2">
                                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Peminjam</div>
                                            <div className="text-sm font-medium text-slate-600">{String(selectedLog.details.borrower)}</div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="text-xs text-slate-400 font-bold uppercase mb-1">Keperluan</div>
                                            <div className="text-sm font-medium text-slate-600 italic">"{String(selectedLog.details.purpose)}"</div>
                                        </div>
                                    </>
                                )}
                                {selectedLog.entry.log.action === 'RETURNED' && (
                                    <div className="col-span-2">
                                        <div className="text-xs text-slate-400 font-bold uppercase mb-1">Kondisi Kembali</div>
                                        <div className={`text-sm font-bold capitalize ${selectedLog.details.condition === 'good' ? 'text-emerald-600' :
                                            selectedLog.details.condition === 'broken' ? 'text-rose-600' : 'text-amber-600'
                                            }`}>{String(selectedLog.details.condition || '-')}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
