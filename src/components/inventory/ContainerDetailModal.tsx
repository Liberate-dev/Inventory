import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Box, Activity, Zap, Scissors, Server, Printer, AlertTriangle, Sparkles } from 'lucide-react';
import type { Container, Item, ItemLog, ServiceRequest, ComponentStatus } from '../../types';
import { useServiceRequests } from '../../context/ServiceRequestContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';
import { useToast } from '../../context/ToastContext';
import { useItemForm } from '../../hooks/useItemForm';
import { useInventory } from '../../context/InventoryContext';
import { ItemStatusBadge } from '../common/ItemStatusBadge';
import { ImageUpload } from '../common/ImageUpload';
import { suggestCanonicalItemName, generateSmartCodeWithAI } from '../../utils/aiClient';
import { buildFallbackSmartCode } from '../../utils/inventoryCode';
import { getAuthHeaders } from '../../utils/api';

interface ContainerDetailModalProps {
    container: Container;
    roomId?: string;
    roomName?: string;
    initialItemId?: string; // Optional deep link
    onClose: () => void;
    onUpdate: (updatedContainer: Container) => void;
}

const renderItemIcon = (type: string, name: string, size: number) => {
    const t = typeof type === 'string' ? type.toLowerCase() : '';
    const n = typeof name === 'string' ? name.toLowerCase() : '';
    if (t.includes('microscope') || n.includes('microscope')) return <Microscope size={size} />;
    if (t.includes('optical') || n.includes('optical')) return <Activity size={size} />;
    if (t.includes('circuit') || n.includes('circuit')) return <Zap size={size} />;
    if (t.includes('dissection') || n.includes('dissection')) return <Scissors size={size} />;
    if (t.includes('server') || n.includes('server')) return <Server size={size} />;
    if (t.includes('printer') || n.includes('printer')) return <Printer size={size} />;
    return <Box size={size} />;
};

const Microscope = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 18h8" /><path d="M3 22h18" /><path d="M14 22a7 7 0 1 0 0-14h-1" /><path d="M9 14h2" /><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" /><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </svg>
);

const createItemLog = (action: string, details: string): ItemLog => ({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    action,
    details
});

const ensureItemLogs = (logs: unknown): ItemLog[] => {
    if (Array.isArray(logs) && logs.length > 0) {
        const validLogs = logs.filter((log): log is ItemLog => {
            if (typeof log !== 'object' || log === null) return false;
            const entry = log as Partial<ItemLog>;
            return typeof entry.action === 'string' && typeof entry.date === 'string';
        });
        if (validLogs.length > 0) {
            return validLogs;
        }
    }
    return [];
};

const formatActionLabel = (action: string): string => {
    if (!action) return '-';
    const normalized = action.replace(/_/g, ' ').toLowerCase();
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const sanitizeLocation = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (raw === '') return '-';
    return raw
        .replace(/\b\d{6,}\b/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s*-\s*$/, '')
        .trim() || '-';
};

const parseLogDetailsObject = (details: unknown): Record<string, unknown> | null => {
    if (typeof details === 'object' && details !== null) {
        return details as Record<string, unknown>;
    }
    if (typeof details === 'string') {
        const trimmed = details.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                const parsed = JSON.parse(trimmed) as unknown;
                if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
            } catch {
                return null;
            }
        }
    }
    return null;
};

const formatLogDetails = (action: string, details: unknown): string => {
    const data = parseLogDetailsObject(details);

    if (action === 'TRANSFER' && data) {
        return `Dari ${sanitizeLocation(data.from)} ke ${sanitizeLocation(data.to)}`;
    }
    if (action === 'CHECK_OUT' && data) {
        let text = `Peminjam: ${String(data.borrower ?? '-')} - ${String(data.purpose ?? '-')}`;
        if (data.lentBy) text += ` (Dipinjam dari: ${String(data.lentBy)})`;
        return text;
    }
    if (action === 'RETURNED' && data) {
        let text = `Dikembalikan oleh: ${String(data.returner ?? data.borrower ?? '-')}`;
        if (data.receivedBy) text += ` (Diterima oleh: ${String(data.receivedBy)})`;
        text += ` (Status: ${String(data.statusAtArrival ?? data.statusAtReturn ?? '-')})`;
        return text;
    }
    if (action === 'MAINTENANCE_REQUESTED' && data) {
        return `Laporan masuk: ${String(data.description ?? '-')}`;
    }
    if (action === 'MAINTENANCE_ACCEPTED') {
        return 'Permintaan maintenance diterima.';
    }
    if (action === 'MAINTENANCE_DENIED' && data) {
        return `Permintaan ditolak: ${String(data.reason ?? '-')}`;
    }
    if (action === 'MAINTENANCE_COMPLETED' && data) {
        return `Maintenance selesai (${String(data.outcome ?? '-')}).`;
    }

    if (data) {
        return Object.entries(data)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(' | ');
    }
    if (typeof details === 'string') return details;
    return String(details ?? '');
};

const ContainerDetailModal = ({ container, roomId, roomName, initialItemId, onClose, onUpdate }: ContainerDetailModalProps) => {
    const { addRequest, requests } = useServiceRequests();
    const { user } = useAuth();
    const { canEditFeature, canSee } = useAccessMatrix();
    const { t } = useLanguage();
    const { showToast } = useToast();
    const canEditInventory = user ? canEditFeature('rooms', user.role) : false;
    const canReportItems = user ? canSee('service_requests', user.role) : false;
    const { itemTypes: availableItemTypes = [], categories: managedCategories = [], createItemType } = useInventory();
    const [items, setItems] = useState<Item[]>(container.items || []);
    const [isFormOpen, setIsFormOpen] = useState(false);

    // Title editing state
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(container.name);

    // Form State managed by custom hook
    const { formData, isEditing, editingId, updateField, resetForm, loadItem, parameterActions } = useItemForm();

    // Initial Deep Link Logic
    useEffect(() => {
        setItems((container.items || []).map((item) => ({
            ...item,
            logs: ensureItemLogs(item.logs)
        })));
    }, [container.items]);

    useEffect(() => {
        if (initialItemId) {
            const item = items.find(i => i.id === initialItemId);
            if (item) {
                loadItem(item);
                setIsFormOpen(true);
            }
        }
    }, [initialItemId, items, loadItem]);

    // Filter active requests for items in this container
    const isItemUnderMaintenance = (itemId: string) => {
        return requests.some((r: ServiceRequest) => r.componentId === itemId && r.status !== 'completed' && r.status !== 'denied');
    };

    const handleOpenAdd = () => {
        if (!canEditInventory) {
            showToast('Anda tidak memiliki izin untuk menambah item.', 'error');
            return;
        }
        resetForm();
        setIsFormOpen(true);
    };

    const handleOpenEdit = (item: Item) => {
        loadItem(item);
        setIsFormOpen(true);
    };

    // Parameter helpers are now provided by the hook
    const { add, remove, update } = parameterActions;

    const handleSaveTitle = () => {
        if (!canEditInventory) {
            setEditTitle(container.name);
            setIsEditingTitle(false);
            showToast('Anda tidak memiliki izin untuk mengubah wadah.', 'error');
            return;
        }
        if (editTitle.trim() && editTitle !== container.name) {
            onUpdate({ ...container, name: editTitle.trim() });
        } else {
            setEditTitle(container.name);
        }
        setIsEditingTitle(false);
    };

    const handleSave = async () => {
        if (!canEditInventory) {
            showToast('Anda tidak memiliki izin untuk menyimpan item.', 'error');
            return;
        }
        if (!formData.name) return;

        let updatedItems = [...items];
        const now = new Date().toISOString();

        let finalItemTypeId = formData.itemTypeId;
        let finalItemTypeName = formData.itemTypeName;

        if (!finalItemTypeId && formData.name) {
            // Create new master item type on the fly (optional in form), AI helped name etc, auto to Manajemen Barang
            try {
                const master = await createItemType({
                    name: formData.name,
                    category: formData.category,
                });
                finalItemTypeId = master.id;
                finalItemTypeName = master.name || formData.name;
                updateField('itemTypeId', finalItemTypeId);
                updateField('itemTypeName', finalItemTypeName);
                showToast('Tipe master baru dibuat via form/AI dan masuk Manajemen Barang.', 'success');
            } catch (e: any) {
                showToast('Gagal membuat tipe master baru: ' + (e?.message || ''), 'error');
                return;
            }
        }

        let finalSku = formData.sku;
        if (!finalSku && formData.name) {
            try {
                const sug = await generateSmartCodeWithAI(formData.name, finalItemTypeName, roomName, formData.category);
                if (sug.suggestedSku) {
                    finalSku = sug.suggestedSku;
                    updateField('sku', finalSku);
                }
            } catch (err) {
                console.warn('Gagal generate SKU otomatis dengan AI:', err);
            }
        }

        const commonData = {
            name: formData.name,
            sku: finalSku,
            type: formData.category || 'Standard', // Maps to type for legacy support
            category: formData.category,
            source: formData.source,
            isConsumable: formData.isConsumable,
            quantity: formData.quantity === '' ? 1 : formData.quantity,
            unit: formData.unit,
            minStock: formData.minStock === '' ? 0 : formData.minStock,
            parameters: formData.parameters,
            itemTypeId: finalItemTypeId,
            itemTypeName: finalItemTypeName,
        };

        if (isEditing && editingId) {
            // Update existing
            updatedItems = items.map(i => {
                if (i.id !== editingId) return i;
                const previousLogs = ensureItemLogs(i.logs);
                const log = {
                    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    date: now,
                    action: 'UPDATED',
                    details: `Item ${formData.name} diperbarui.`
                };
                return {
                    ...i,
                    ...commonData,
                    status: formData.status as ComponentStatus,
                    logs: [log, ...previousLogs]
                };
            });
        } else {
            // Add new
            const newItem: Item = {
                id: `item-${Date.now()}`,
                ...commonData,
                status: 'good', // Default to good instead of available
                condition: 'good', // Default condition
                specs: formData.parameters.map(p => `${p.label}: ${p.value}`).join(', ') || 'Standard', // Fallback for legacy specs
                logs: [createItemLog('CREATED', `Item ${formData.name} ditambahkan.`)]
            };
            updatedItems.push(newItem);
        }

        setItems(updatedItems);
        onUpdate({ ...container, items: updatedItems });
        resetForm();
        setIsFormOpen(false);
    };

    const handleDeleteItem = (itemId: string) => {
        if (!canEditInventory) {
            showToast('Anda tidak memiliki izin untuk menghapus item.', 'error');
            return;
        }
        const updatedItems = items.filter(i => i.id !== itemId);
        setItems(updatedItems);
        onUpdate({ ...container, items: updatedItems });
    };

    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const openedFromDeepLink = Boolean(initialItemId);

    const handleReportIssue = () => {
        if (!isEditing) return; // Only report active items
        setReportReason('');
        setIsReportOpen(true);
    };

    const handleCloseForm = () => {
        resetForm();
        setIsReportOpen(false);
        setReportReason('');

        if (openedFromDeepLink) {
            onClose();
            return;
        }

        setIsFormOpen(false);
    };

    const confirmReport = async () => {
        if (!isEditing || !editingId || !reportReason.trim()) return;

        try {
            await addRequest({
                componentId: editingId,
                componentName: formData.name,
                stationId: container.id,
                stationName: container.name,
                roomId: roomId ?? 'unknown',
                roomName: roomName ?? 'unknown',
                description: reportReason,
                requesterName: user?.name || 'Unknown User',
                componentSku: formData.sku,
                componentCategory: formData.category,
            });

            const updatedItems = items.map((item) => {
                if (item.id !== editingId) return item;
                return {
                    ...item,
                    status: 'maintenance' as const,
                    logs: [
                        createItemLog('MAINTENANCE_REQUESTED', `Laporan maintenance dibuat: ${reportReason.trim()}`),
                        ...ensureItemLogs(item.logs)
                    ]
                };
            });

            setItems(updatedItems);
            onUpdate({ ...container, items: updatedItems });

            showToast(t('report_success'), 'success');
            setIsReportOpen(false);
            setIsFormOpen(false); // Close the edit form too
        } catch (error) {
            console.error('Failed to submit service request:', error);
            showToast(error instanceof Error ? error.message : 'Gagal mengirim laporan ke backend.', 'error');
        }
    };

    const activeRequest = editingId ? requests.find((r: ServiceRequest) => r.componentId === editingId && r.status !== 'completed' && r.status !== 'denied') : undefined;
    const selectedItemLogs = editingId
        ? (items.find((item) => item.id === editingId)?.logs ?? []).filter((log) => log.action !== 'INITIALIZED')
        : [];
    const isReadOnlyMode = isFormOpen && isEditing && !canEditInventory;

    // AI handlers for name dedup (point 1) and code (point 2)
    const [isCheckingAiName, setIsCheckingAiName] = useState(false);

    const handleAiNameCheck = async () => {
        const current = formData.name?.trim();
        if (!current || isReadOnlyMode) return;
        setIsCheckingAiName(true);
        try {
            const suggestion = await suggestCanonicalItemName(current, availableItemTypes as any[], managedCategories as any[]);
            updateField('name', suggestion.suggestedName);
            if (suggestion.category) {
                updateField('category', suggestion.category);
            }
            const toastMsg = suggestion.reason
                ? `AI saran: ${suggestion.suggestedName} — ${suggestion.reason}`
                : `AI: ${suggestion.suggestedName}`;
            showToast(toastMsg, 'success');

            // Auto generate inventory code (SKU) after AI name suggestion, using the (possibly updated) name + category from Manajemen Kategori
            if (!isEditing) {
                void handleSmartCode(suggestion.suggestedName, suggestion.category);
            }
        } catch (err: any) {
            showToast('AI cek nama gagal: ' + (err?.message || ''), 'error');
        } finally {
            setIsCheckingAiName(false);
        }
    };

    const handleSmartCode = async (overrideName?: string, overrideCategory?: string) => {
        if (isReadOnlyMode) return;
        const useName = overrideName || formData.name || formData.itemTypeName || '';
        const useCategory = overrideCategory || formData.category;
        try {
            const res = await generateSmartCodeWithAI(
                useName,
                formData.itemTypeName,
                roomName,
                useCategory  // pass category from Manajemen Kategori for AI awareness
            );
            if (res?.suggestedSku) {
                updateField('sku', res.suggestedSku);
                const msg = res.reason ? `${res.suggestedSku} — ${res.reason}` : res.suggestedSku;
                showToast(`AI kode: ${msg}`, 'success');
                return;
            }
        } catch (err) {
            console.warn('AI SKU failed, using smart fallback:', err);
        }

        // Smart fallback: [Ruangan]-[Nama Barang]-[Nomor Urut] using actual nextNumber & padding
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/public/api'}/inventory/inventory_codes.php`, {
                headers: getAuthHeaders()
            });
            const payload = await response.json();
            if (response.ok && payload.status === 'success' && payload.settings) {
                const fallback = buildFallbackSmartCode(
                    roomName,
                    useName,
                    payload.settings.nextNumber,
                    payload.settings.sequencePadding
                );
                updateField('sku', fallback);
                showToast(`Smart kode fallback: ${fallback}`, 'success');
                return;
            }
        } catch (err) {
            console.error('Failed to load settings for smart fallback:', err);
        }

        // Last resort fallback
        const fallback = buildFallbackSmartCode(roomName, useName, Math.floor(Math.random() * 100) + 1, 4);
        updateField('sku', fallback);
        showToast(`Smart kode fallback: ${fallback}`, 'success');
    };

    // Use central managed categories from Manajemen Barang for the dropdown (auto-connect when sarpras adds new categories).
    // Fallback to categories already assigned to existing item types if no managed list yet.
    const categoryOptions = managedCategories.length > 0
        ? managedCategories.map((c: any) => c.name).sort()
        : Array.from(
            new Set((availableItemTypes as any[]).map((t: any) => t.category).filter((c: any) => !!c))
          ).sort() as string[];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <Box size={24} />
                        </div>
                        <div>
                            {isEditingTitle ? (
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    onBlur={handleSaveTitle}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                                    autoFocus
                                    className="text-xl font-bold text-gray-900 bg-white border border-indigo-300 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500 w-auto min-w-[200px]"
                                />
                            ) : (
                                <h3
                                    className="text-xl font-bold text-gray-900 cursor-text hover:text-indigo-600 hover:underline decoration-dashed decoration-indigo-300 underline-offset-4"
                                    onClick={() => {
                                        if (!canEditInventory) return;
                                        setIsEditingTitle(true);
                                    }}
                                    title="Click to edit name"
                                >
                                    {container.name}
                                </h3>
                            )}
                            <p className="text-sm text-gray-500 capitalize">{container.type} • {items.length} {t('items_count')}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1 bg-gray-50/30">
                    {items.length === 0 && !isFormOpen ? (
                        <div className="text-center py-16 text-gray-400">
                            <Box size={64} className="mx-auto mb-4 opacity-20" />
                            <p className="text-lg font-medium text-gray-500">{t('container_empty')}</p>
                            <p className="text-sm mb-6">{t('container_empty_desc')}</p>
                            {canEditInventory && (
                                <button
                                    onClick={handleOpenAdd}
                                    className="px-6 py-2.5 text-white bg-indigo-600 font-medium hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95"
                                >
                                    {t('add_first_item')}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                            {items.map(item => (
                                <ItemCard
                                    key={item.id}
                                    item={item}
                                    onEdit={() => handleOpenEdit(item)}
                                    onDelete={() => handleDeleteItem(item.id)}
                                    hasActiveRequest={isItemUnderMaintenance(item.id)}
                                    canEdit={canEditInventory}
                                />
                            ))}

                            {/* Add Item Button Card */}
                            {!isFormOpen && canEditInventory && (
                                <button
                                    onClick={handleOpenAdd}
                                    className="group border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center p-6 text-gray-400 hover:border-indigo-500 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all h-full min-h-[180px]"
                                >
                                    <div className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-indigo-100 flex items-center justify-center mb-3 transition-colors">
                                        <Plus size={24} />
                                    </div>
                                    <span className="text-sm font-bold">{t('add_new_item')}</span>
                                </button>
                            )}
                        </div>
                    )}

                    {/* Add/Edit Form Overlay */}
                    <AnimatePresence>
                        {isFormOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                onClick={handleCloseForm}
                                className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-white/80 backdrop-blur-md"
                            >
                                <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 relative max-h-[90vh] flex flex-col overflow-hidden"
                                >
                                    <button
                                        onClick={handleCloseForm}
                                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                                    >
                                        <X size={20} />
                                    </button>

                                    <h4 className="shrink-0 px-6 pt-6 pb-4 pr-14 text-xl font-bold text-gray-800 border-b border-gray-100">
                                        {isReadOnlyMode ? 'Detail Item' : isEditing ? t('edit_item_details') : t('add_new_item')}
                                    </h4>

                                    <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar px-6 pt-6 pb-6">

                                        {/* SECTION 1: IDENTIFICATION */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Pilih Item (Tipe Master) first — the "item", label/SKU then distinguishes specific physical units */}
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Pilih Item (Tipe) - opsional</label>
                                                <select
                                                    value={formData.itemTypeId || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        updateField('itemTypeId', val || '');
                                                        const chosen = (availableItemTypes as any[]).find((t: any) => String(t.id) === val);
                                                        if (chosen) {
                                                            updateField('itemTypeName', chosen.name || '');
                                                            updateField('category', chosen.category || '');
                                                            if (!isEditing) {
                                                                updateField('name', chosen.name || '');
                                                                void handleSmartCode(chosen.name, chosen.category);
                                                            }
                                                        } else {
                                                            updateField('itemTypeName', '');
                                                        }
                                                    }}
                                                    disabled={isReadOnlyMode}
                                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-semibold text-gray-800 bg-white"
                                                >
                                                    <option value="">-- Buat baru (isi nama di bawah) atau pilih tipe existing --</option>
                                                    {(availableItemTypes as any[]).map((t: any) => (
                                                        <option key={t.id} value={t.id}>{t.name}{t.category ? ` (${t.category})` : ''}</option>
                                                    ))}
                                                </select>
                                                <p className="text-[10px] text-slate-500 mt-1">Opsional: pilih master existing dari Manajemen Barang, atau kosongkan + isi nama untuk buat master baru (otomatis masuk MB via AI bantuan). Label/SKU membedakan unit fisik.</p>
                                            </div>

                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('item_name')} (dari tipe atau sesuaikan) <span className="text-red-500">*</span></label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={formData.name}
                                                        onChange={(e) => updateField('name', e.target.value)}
                                                        disabled={isReadOnlyMode}
                                                        className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-gray-800"
                                                        placeholder="e.g. Meja Kerja (override jika perlu)"
                                                        autoFocus
                                                    />
                                                    {!isReadOnlyMode && (
                                                        <button
                                                            type="button"
                                                            onClick={handleAiNameCheck}
                                                            disabled={isCheckingAiName || !formData.name?.trim()}
                                                            className={`p-2.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-600 rounded-xl transition disabled:opacity-50 ${isCheckingAiName ? 'cursor-wait' : ''}`}
                                                            title={isCheckingAiName ? 'Sedang cek dengan AI...' : 'Cek dengan AI: sarankan nama standar & hindari nama redundan di seluruh sistem'}
                                                        >
                                                            <Sparkles size={18} className={isCheckingAiName ? 'animate-pulse' : ''} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('sku_code')} (Label Pemisah Spesifik)</label>
                                                <input
                                                    type="text"
                                                    value={formData.sku}
                                                    onChange={(e) => updateField('sku', e.target.value)}
                                                    disabled={isReadOnlyMode}
                                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm uppercase"
                                                    placeholder="INV-... (otomatis dari pilihan Item / bisa diedit manual)"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('category_label')}</label>
                                                <select
                                                    value={formData.category}
                                                    onChange={(e) => updateField('category', e.target.value)}
                                                    disabled={isReadOnlyMode}
                                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                                >
                                                    <option value="">-- Pilih Kategori (dikelola di Manajemen Barang) --</option>
                                                    {categoryOptions.map((c: string) => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                                <p className="text-[10px] text-slate-500 mt-0.5">Kategori dikelola secara terpusat di Manajemen Barang (oleh sarpras) dan otomatis tersedia di form ini (integrasi via context).</p>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Asal Barang</label>
                                                <input
                                                    type="text"
                                                    value={formData.source}
                                                    onChange={(e) => updateField('source', e.target.value)}
                                                    disabled={isReadOnlyMode}
                                                    list="source-suggestions"
                                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    placeholder="e.g. Dana Sekolah"
                                                />
                                                <datalist id="source-suggestions">
                                                    <option value="Dana Sekolah" />
                                                    <option value="Dana Hibah" />
                                                    <option value="BOS" />
                                                    <option value="BOP" />
                                                    <option value="Donasi" />
                                                </datalist>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <ImageUpload
                                                value={formData.imageUrl}
                                                onChange={(url) => updateField('imageUrl', url)}
                                                label="Gambar Item (Opsional)"
                                                description="JPG, PNG, WEBP (Max 5MB)"
                                            />
                                        </div>

                                        {/* SECTION 2: TRACKING & STOCK */}
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                                        {t('quantity')}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        placeholder="e.g. 1"
                                                        value={formData.quantity || ''}
                                                        disabled={isReadOnlyMode}
                                                        onChange={(e) => {
                                                            const val = e.target.value.replace(/\D/g, '');
                                                            updateField('quantity', val ? parseInt(val, 10) : 0);
                                                        }}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('unit')}</label>
                                                    <input
                                                        type="text"
                                                        value={formData.unit}
                                                        onChange={(e) => updateField('unit', e.target.value)}
                                                        disabled={isReadOnlyMode}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        placeholder="Pcs"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* SECTION 3: PARAMETERS */}
                                        <div>
                                            <div className="flex justify-between items-end mb-2">
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">{t('params_specs')}</label>
                                                {canEditInventory && (
                                                    <div className="flex gap-1">
                                                        {['Brand', 'Model', 'S/N'].map(s => (
                                                            <button key={s} onClick={() => add(s, '')} className="text-[10px] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors">
                                                                + {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                {formData.parameters.map((param, idx) => (
                                                    <div key={idx} className="flex gap-2">
                                                        <input
                                                            placeholder="Label (e.g. Brand)"
                                                            value={param.label}
                                                            disabled={isReadOnlyMode}
                                                            onChange={(e) => update(idx, 'label', e.target.value)}
                                                            className="w-1/3 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 bg-gray-50"
                                                        />
                                                        <input
                                                            placeholder="Value (e.g. Dell)"
                                                            value={param.value}
                                                            disabled={isReadOnlyMode}
                                                            onChange={(e) => update(idx, 'value', e.target.value)}
                                                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500"
                                                        />
                                                        {canEditInventory && (
                                                            <button onClick={() => remove(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {canEditInventory && (
                                                    <button onClick={() => add()} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-sm font-bold hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
                                                        {t('add_custom_param')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* SECTION 4: ITEM LOGS */}
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{t('component_history')}</h5>
                                            {isEditing ? (
                                                <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                                                    {[...selectedItemLogs].reverse().map((log) => (
                                                        <div key={log.id} className="border border-slate-200 rounded-lg bg-white p-2.5">
                                                            <div className="text-[11px] text-slate-500">
                                                                {new Date(log.date).toLocaleDateString()} | {new Date(log.date).toLocaleTimeString()}
                                                            </div>
                                                            <div className="text-xs font-semibold text-slate-800 mt-1">{formatActionLabel(log.action)}</div>
                                                            <div className="text-xs text-slate-600 mt-1">{formatLogDetails(log.action, log.details)}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-500">
                                                    Log awal akan otomatis dibuat saat item disimpan.
                                                </p>
                                            )}
                                        </div>

                                        {/* Status Selection (Simplified) */}
                                        <div className="pt-4 border-t border-gray-100 opacity-70">
                                            <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                                                <AlertTriangle size={12} /> {t('condition_status_hint')}
                                            </p>
                                            <div className="flex gap-2">
                                                <ItemStatusBadge status={formData.status as ComponentStatus} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4">
                                        <div className="flex items-stretch justify-between gap-4">
                                            {isEditing && !activeRequest && canReportItems ? (
                                                <button
                                                    onClick={handleReportIssue}
                                                    className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold hover:bg-red-100 transition-colors flex flex-col items-center justify-center text-center gap-1 h-auto min-w-[80px]"
                                                >
                                                    <AlertTriangle size={20} />
                                                    <span className="text-[10px] leading-tight whitespace-pre-wrap">{t('report_issue_item')}</span>
                                                </button>
                                            ) : (
                                                <div /> // Spacer
                                            )}

                                            <div className="flex gap-3 flex-1 justify-end items-center">
                                                <button
                                                    onClick={handleCloseForm}
                                                    className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-50 rounded-xl transition-colors"
                                                >
                                                    {t('btn_cancel')}
                                                </button>
                                                {canEditInventory && (
                                                    <button
                                                        onClick={handleSave}
                                                        disabled={!formData.name}
                                                        className="flex-1 max-w-[200px] py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                                                    >
                                                        {isEditing ? t('save_changes') : t('add_item')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Report Issue Modal Overlay */}
                        {isReportOpen && isEditing && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                onClick={() => setIsReportOpen(false)}
                                className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-white/10 backdrop-blur-sm"
                            >
                                <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
                                    <h4 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                                        <AlertTriangle className="text-amber-500" size={20} /> {t('report_issue_title')}
                                    </h4>
                                    <p className="text-sm text-gray-500 mb-4">{t('describe_issue')} <b>{formData.name}</b>.</p>
                                    <textarea
                                        autoFocus
                                        value={reportReason}
                                        onChange={(e) => setReportReason(e.target.value)}
                                        className="w-full h-32 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none resize-none text-sm mb-4"
                                        placeholder="E.g. Broken screen, missing parts..."
                                    />
                                    <div className="flex gap-3">
                                        <button onClick={() => setIsReportOpen(false)} className="flex-1 py-2 text-gray-600 font-bold hover:bg-gray-100 rounded-xl">{t('btn_cancel')}</button>
                                        <button onClick={() => { void confirmReport(); }} className="flex-1 py-2 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 shadow-lg shadow-amber-200">{t('submit_report')}</button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};

// 2D Item Card Component matching user design
const ItemCard = ({ item, onEdit, onDelete, hasActiveRequest, canEdit = true }: { item: Item, onEdit: () => void, onDelete: () => void, hasActiveRequest?: boolean, canEdit?: boolean }) => {
    return (
        <motion.div
            layout
            onClick={onEdit}
            whileHover={{ y: -4 }}
            className={`group relative bg-white p-5 rounded-2xl shadow-sm border hover:shadow-lg transition-all flex flex-col items-center cursor-pointer ${hasActiveRequest ? 'border-amber-300 shadow-amber-100 ring-2 ring-amber-200' : 'border-gray-100 hover:border-indigo-100'
                }`}
        >
            {canEdit && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                    <Trash2 size={16} />
                </button>
            )}

            {hasActiveRequest && (
                <div className="absolute top-3 left-3 text-amber-500 animate-pulse">
                    <AlertTriangle size={16} fill="currentColor" className="text-amber-100" />
                </div>
            )}

            <div className="w-14 h-14 mb-4 rounded-full bg-gray-50 group-hover:bg-indigo-50 flex items-center justify-center text-gray-500 group-hover:text-indigo-600 transition-colors overflow-hidden relative border border-gray-100">
                {item.imageUrl || item.image_layer ? (
                    <img src={item.imageUrl || item.image_layer} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                    renderItemIcon(item.type, item.name, 28)
                )}
            </div>

            <div className="text-center w-full">
                <h4 className="font-bold text-gray-900 text-sm truncate uppercase tracking-tight mb-1">{item.name}</h4>
                <p className="text-[10px] text-gray-400 font-medium mb-3 truncate">{item.sku || 'No SKU'}</p>
                
                <div className="flex justify-center">
                    <ItemStatusBadge status={item.status} />
                </div>
            </div>
        </motion.div>
    );
};

export default ContainerDetailModal;
