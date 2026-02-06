import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Box, Activity, Zap, Scissors, Server, Printer, AlertTriangle, RefreshCw, CheckSquare, Square } from 'lucide-react';
import type { Container, Item, ServiceRequest, ComponentCondition } from '../types';
import { useServiceRequests } from '../context/ServiceRequestContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useItemForm } from '../hooks/useItemForm';

interface ContainerDetailModalProps {
    container: Container;
    initialItemId?: string; // Optional deep link
    onClose: () => void;
    onUpdate: (updatedContainer: Container) => void;
}

const getItemIcon = (type: string, name: string) => {
    const t = type.toLowerCase();
    const n = name.toLowerCase();
    if (t.includes('microscope') || n.includes('microscope')) return Microscope;
    if (t.includes('optical') || n.includes('optical')) return Activity;
    if (t.includes('circuit') || n.includes('circuit')) return Zap;
    if (t.includes('dissection') || n.includes('dissection')) return Scissors;
    if (t.includes('server') || n.includes('server')) return Server;
    if (t.includes('printer') || n.includes('printer')) return Printer;
    return Box;
};

// Lazy import for icon components to avoid circular dependencies or massive imports if not needed, 
// but here we just return the component.
const Microscope = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 18h8" /><path d="M3 22h18" /><path d="M14 22a7 7 0 1 0 0-14h-1" /><path d="M9 14h2" /><path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" /><path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
    </svg>
);

const ContainerDetailModal = ({ container, initialItemId, onClose, onUpdate }: ContainerDetailModalProps) => {
    const { addRequest, requests } = useServiceRequests();
    const { user } = useAuth();
    const { t } = useLanguage();
    const { showToast } = useToast();
    const [items, setItems] = useState<Item[]>(container.items || []);
    const [isFormOpen, setIsFormOpen] = useState(false);

    // Initial Deep Link Logic
    // Initial Deep Link Logic
    useEffect(() => {
        if (initialItemId) {
            const item = items.find(i => i.id === initialItemId);
            if (item) {
                loadItem(item);
                setIsFormOpen(true);
            }
        }
    }, [initialItemId, items]); // Added dependencies

    // Filter active requests for items in this container
    const isItemUnderMaintenance = (itemId: string) => {
        return requests.some((r: ServiceRequest) => r.componentId === itemId && r.status !== 'completed' && r.status !== 'denied');
    };

    // Form State
    // Form State managed by custom hook
    const { formData, isEditing, editingId, updateField, resetForm, loadItem, generateSku, parameterActions } = useItemForm();

    const handleOpenAdd = () => {
        resetForm();
        setIsFormOpen(true);
    };

    const handleOpenEdit = (item: Item) => {
        loadItem(item);
        setIsFormOpen(true);
    };

    // Parameter helpers are now provided by the hook
    const { add, remove, update } = parameterActions;

    const handleSave = () => {
        if (!formData.name) return;

        let updatedItems = [...items];

        const commonData = {
            name: formData.name,
            sku: formData.sku,
            type: formData.category || 'Standard', // Maps to type for legacy support
            category: formData.category,
            isConsumable: formData.isConsumable,
            quantity: formData.quantity,
            unit: formData.unit,
            minStock: formData.minStock,
            parameters: formData.parameters,
        };

        if (isEditing && editingId) {
            // Update existing
            updatedItems = items.map(i => i.id === editingId ? {
                ...i,
                ...commonData,
                condition: formData.condition // Update condition as well
            } : i);
        } else {
            // Add new
            const newItem: Item = {
                id: `item-${Date.now()}`,
                ...commonData,
                status: 'available', // Default availability
                condition: formData.condition, // Initial condition
                specs: formData.parameters.map(p => `${p.label}: ${p.value}`).join(', ') || 'Standard', // Fallback for legacy specs
                logs: []
            };
            updatedItems.push(newItem);
        }

        setItems(updatedItems);
        onUpdate({ ...container, items: updatedItems });
        resetForm();
    };

    const handleDeleteItem = (itemId: string) => {
        const updatedItems = items.filter(i => i.id !== itemId);
        setItems(updatedItems);
        onUpdate({ ...container, items: updatedItems });
    };

    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reportReason, setReportReason] = useState('');

    const handleReportIssue = () => {
        if (!isEditing) return; // Only report active items
        setReportReason('');
        setIsReportOpen(true);
    };

    const confirmReport = () => {
        if (!isEditing || !editingId || !reportReason.trim()) return;

        // Find the original item for some context if needed, or use formData
        // Using formData is safer for current state
        addRequest({
            componentId: editingId,
            componentName: formData.name,
            stationId: container.id,
            stationName: container.name,
            roomId: 'unknown',
            description: reportReason,
            requesterName: user?.name || 'Unknown User',
            componentSku: formData.sku,
            componentCategory: formData.category,
        });

        // Optimistically update condition to 'service'
        const updatedItems = items.map(i => i.id === editingId ? { ...i, condition: 'service' as ComponentCondition } : i);
        setItems(updatedItems);
        onUpdate({ ...container, items: updatedItems });

        showToast(t('report_success'), 'success');
        setIsReportOpen(false);
        setIsFormOpen(false); // Close the edit form too
    };



    const activeRequest = editingId ? requests.find((r: ServiceRequest) => r.componentId === editingId && r.status !== 'completed' && r.status !== 'denied') : undefined;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <Box size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">{container.name}</h3>
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
                            <button
                                onClick={handleOpenAdd}
                                className="px-6 py-2.5 text-white bg-indigo-600 font-medium hover:bg-indigo-50 rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95"
                            >
                                {t('add_first_item')}
                            </button>
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
                                />
                            ))}

                            {/* Add Item Button Card */}
                            {!isFormOpen && (
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
                                className="fixed inset-0 z-10 flex items-center justify-center p-4 bg-white/80 backdrop-blur-md absolute inset-0"
                            >
                                <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                                    <button
                                        onClick={resetForm}
                                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                                    >
                                        <X size={20} />
                                    </button>

                                    <h4 className="text-xl font-bold text-gray-800 mb-6 border-b border-gray-100 pb-4">
                                        {isEditing ? t('edit_item_details') : t('add_new_item')}
                                    </h4>

                                    <div className="space-y-6">

                                        {/* SECTION 1: IDENTIFICATION */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('item_name')} <span className="text-red-500">*</span></label>
                                                <input
                                                    type="text"
                                                    value={formData.name}
                                                    onChange={(e) => updateField('name', e.target.value)}
                                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-gray-800"
                                                    placeholder="e.g. Dell Monitor 24inch"
                                                    autoFocus
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('sku_code')}</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={formData.sku}
                                                        onChange={(e) => updateField('sku', e.target.value)}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-sm uppercase"
                                                        placeholder="INV-..."
                                                    />
                                                    <button onClick={generateSku} className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200" title="Generate SKU">
                                                        <RefreshCw size={20} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('category_label')}</label>
                                                <input
                                                    type="text"
                                                    value={formData.category}
                                                    onChange={(e) => updateField('category', e.target.value)}
                                                    list="category-suggestions"
                                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    placeholder="e.g. Hardware"
                                                />
                                                <datalist id="category-suggestions">
                                                    <option value="Hardware" />
                                                    <option value="Consumables" />
                                                    <option value="Glassware" />
                                                    <option value="Chemicals" />
                                                    <option value="Electronics" />
                                                </datalist>
                                            </div>
                                        </div>

                                        {/* SECTION 2: TRACKING & STOCK */}
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <div className="flex items-center gap-2 mb-4">
                                                <button
                                                    onClick={() => updateField('isConsumable', !formData.isConsumable)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${formData.isConsumable ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400'}`}
                                                >
                                                    {formData.isConsumable ? <CheckSquare size={16} /> : <Square size={16} />}
                                                    <span className="text-sm font-bold">{t('is_consumable')}</span>
                                                </button>
                                                <span className="text-xs text-gray-500">{t('enable_stock_tracking')}</span>
                                            </div>

                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                                                        {formData.isConsumable ? t('current_stock') : t('quantity')}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={formData.quantity}
                                                        onChange={(e) => updateField('quantity', parseInt(e.target.value) || 0)}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono font-bold"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{t('unit')}</label>
                                                    <input
                                                        type="text"
                                                        value={formData.unit}
                                                        onChange={(e) => updateField('unit', e.target.value)}
                                                        className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        placeholder="Pcs"
                                                    />
                                                </div>

                                                {formData.isConsumable && (
                                                    <div className="animate-in fade-in slide-in-from-left-4">
                                                        <label className="block text-xs font-bold text-amber-600 uppercase tracking-wider mb-1.5">{t('min_stock')}</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={formData.minStock}
                                                            onChange={(e) => updateField('minStock', parseInt(e.target.value) || 0)}
                                                            className="w-full px-4 py-2.5 border border-amber-300 bg-amber-50 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-mono font-bold text-amber-800"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* SECTION 3: PARAMETERS */}
                                        <div>
                                            <div className="flex justify-between items-end mb-2">
                                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">{t('params_specs')}</label>
                                                <div className="flex gap-1">
                                                    {['Brand', 'Model', 'S/N'].map(s => (
                                                        <button key={s} onClick={() => add(s, '')} className="text-[10px] px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors">
                                                            + {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                {formData.parameters.map((param, idx) => (
                                                    <div key={idx} className="flex gap-2">
                                                        <input
                                                            placeholder="Label (e.g. Brand)"
                                                            value={param.label}
                                                            onChange={(e) => update(idx, 'label', e.target.value)}
                                                            className="w-1/3 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 bg-gray-50"
                                                        />
                                                        <input
                                                            placeholder="Value (e.g. Dell)"
                                                            value={param.value}
                                                            onChange={(e) => update(idx, 'value', e.target.value)}
                                                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500"
                                                        />
                                                        <button onClick={() => remove(idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button onClick={() => add()} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-gray-400 text-sm font-bold hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50 transition-all">
                                                    {t('add_custom_param')}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Status Selection (Preserved) */}
                                        <div className="pt-4 border-t border-gray-100 opacity-70">
                                            <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                                                <AlertTriangle size={12} /> {t('condition_status_hint')}
                                            </p>
                                            <div className="flex gap-2">
                                                <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase ${formData.condition === 'good' ? 'bg-emerald-100 text-emerald-700' : formData.condition === 'service' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                                    {formData.condition}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-stretch justify-between pt-4 gap-4 sticky bottom-0 bg-white border-t border-gray-100">
                                            {isEditing && !activeRequest ? (
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
                                                    onClick={resetForm}
                                                    className="px-6 py-3 text-gray-600 font-bold hover:bg-gray-50 rounded-xl transition-colors"
                                                >
                                                    {t('btn_cancel')}
                                                </button>
                                                <button
                                                    onClick={handleSave}
                                                    disabled={!formData.name}
                                                    className="flex-1 max-w-[200px] py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                                                >
                                                    {isEditing ? t('save_changes') : t('add_item')}
                                                </button>
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
                                className="fixed inset-0 z-20 flex items-center justify-center p-4 bg-white/10 backdrop-blur-sm"
                            >
                                <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
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
                                        <button onClick={confirmReport} className="flex-1 py-2 bg-amber-500 text-white font-bold rounded-xl hover:bg-amber-600 shadow-lg shadow-amber-200">{t('submit_report')}</button>
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
// 2D ItemCard Component
const ItemCard = ({ item, onEdit, onDelete, hasActiveRequest }: { item: Item, onEdit: () => void, onDelete: () => void, hasActiveRequest?: boolean }) => {
    const Icon = getItemIcon(item.type, item.name);
    const { t } = useLanguage();

    return (
        <motion.div
            layout
            onClick={onEdit}
            whileHover={{ y: -4 }}
            className={`group relative bg-white p-5 rounded-2xl shadow-sm border hover:shadow-lg cursor-pointer transition-all flex flex-col items-center ${hasActiveRequest ? 'border-amber-300 shadow-amber-100 ring-2 ring-amber-200' : 'border-gray-100 hover:border-indigo-100'
                }`}
        >
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
            >
                <Trash2 size={16} />
            </button>

            {hasActiveRequest && (
                <div className="absolute top-3 left-3 text-amber-500 animate-pulse">
                    <AlertTriangle size={16} fill="currentColor" className="text-amber-100" />
                </div>
            )}

            <div className="w-14 h-14 mb-4 rounded-full bg-gray-50 group-hover:bg-indigo-50 flex items-center justify-center text-gray-500 group-hover:text-indigo-600 transition-colors">
                <Icon size={28} />
            </div>

            <h4 className="font-bold text-gray-900 text-base mb-1 text-center leading-tight line-clamp-2">{item.name}</h4>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">{item.category || item.type}</p>

            {/* Quantity Badge */}
            <div className="mb-3 px-2 py-0.5 bg-slate-100 rounded text-[10px] font-mono text-slate-600 border border-slate-200">
                {item.quantity || 1} {item.unit || 'Pcs'}
                {item.isConsumable && (item.quantity || 0) <= (item.minStock || 0) && (
                    <span className="ml-2 text-rose-500 font-bold">{t('low_stock')}</span>
                )}
            </div>

            <div className={`px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider ${item.condition === 'good' ? 'bg-emerald-100 text-emerald-700' :
                item.condition === 'service' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                }`}>
                {item.condition}
            </div>
        </motion.div>
    );
};

export default ContainerDetailModal;
