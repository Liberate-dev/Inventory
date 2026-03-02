import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Keyboard, Mouse, Cpu, ChevronRight, Activity, Clock, Plus, Trash2, Save, Maximize, AlertTriangle, ChevronLeft } from 'lucide-react';
import type { Container, ComponentStatus, ComponentCondition, ItemLog, Item } from '../types';
import { useServiceRequests } from '../context/ServiceRequestContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

import StationVisualizer from './StationVisualizer';

interface StationDetailModalProps {
    station: Container;
    roomId?: string;
    initialSelectedComponent?: string; // Optional deep link
    onClose: () => void;
    onUpdate: (updatedContainer: Container) => void;
}

export type ComponentType = 'monitor' | 'keyboard' | 'mouse' | 'pc' | 'desk';

// Helper to map generic item types to specific component slots
const parseSpecs = (rawSpecs: unknown, fallback: string[]) => {
    if (typeof rawSpecs === 'string') {
        return rawSpecs.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    if (Array.isArray(rawSpecs)) {
        return rawSpecs.map((entry) => String(entry)).filter(Boolean);
    }
    return fallback;
};

const normalizeType = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');

const createComponentLog = (action: string, details: string): ItemLog => ({
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    action,
    details
});

const ensureComponentLogs = (logs: unknown): ItemLog[] => {
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
    if (typeof details === 'object' && details !== null) return details as Record<string, unknown>;
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
    if (action === 'TRANSFER' && data) return `Dari ${sanitizeLocation(data.from)} ke ${sanitizeLocation(data.to)}`;
    if (action === 'CHECK_OUT' && data) return `Peminjam: ${String(data.borrower ?? '-')} - ${String(data.purpose ?? '-')}`;
    if (action === 'RETURNED' && data) return `Dikembalikan oleh: ${String(data.returner ?? data.borrower ?? '-')} (Kondisi: ${String(data.condition ?? '-')})`;
    if (action === 'MAINTENANCE_REQUESTED' && data) return `Laporan masuk: ${String(data.description ?? '-')}`;
    if (action === 'MAINTENANCE_ACCEPTED') return 'Permintaan maintenance diterima.';
    if (action === 'MAINTENANCE_DENIED' && data) return `Permintaan ditolak: ${String(data.reason ?? '-')}`;
    if (action === 'MAINTENANCE_COMPLETED' && data) return `Maintenance selesai (${String(data.outcome ?? '-')}).`;
    if (data) return Object.entries(data).map(([key, value]) => `${key}: ${String(value)}`).join(' | ');
    if (typeof details === 'string') return details;
    return String(details ?? '');
};

const mapItemsToComponents = (items: any[]) => {
    const components: Record<string, any> = {};
    items.forEach(item => {
        const type = normalizeType(item?.type);
        if (!type) return;
        const baseComponent = {
            ...item,
            logs: ensureComponentLogs(item?.logs)
        };
        if (['monitor', 'screen', 'display'].includes(type)) components.monitor = { ...baseComponent, specs: parseSpecs(item?.specs, ['Standard Display']) };
        else if (['keyboard', 'keypad'].includes(type)) components.keyboard = { ...baseComponent, specs: parseSpecs(item?.specs, ['Standard Layout']) };
        else if (['mouse', 'trackpad'].includes(type)) components.mouse = { ...baseComponent, specs: parseSpecs(item?.specs, ['Standard Optical']) };
        else if (['pc', 'computer', 'desktop', 'tower', 'pc unit'].includes(type)) components.pc = { ...baseComponent, specs: parseSpecs(item?.specs, ['Standard config']) };
        else if (['desk', 'table', 'physical desk', 'workstation'].includes(type)) components.desk = { ...baseComponent, specs: parseSpecs(item?.specs, ['Standard Desk']) };
    });
    return components;
};

const renderActiveIcon = (selectedComponent: string | null, hoveredComponent: ComponentType | null) => {
    switch (selectedComponent || hoveredComponent) {
        case 'monitor': return <Monitor className="text-indigo-400" size={24} />;
        case 'keyboard': return <Keyboard className="text-indigo-400" size={24} />;
        case 'mouse': return <Mouse className="text-indigo-400" size={24} />;
        case 'pc': return <Cpu className="text-indigo-400" size={24} />;
        case 'desk': return <Maximize className="text-indigo-400" size={24} />;
        default: return <Activity className="text-indigo-400" size={24} />;
    }
};

const StationDetailModal = ({ station, roomId, initialSelectedComponent, onClose, onUpdate }: StationDetailModalProps) => {
    // Derive initial state from props
    const { addRequest } = useServiceRequests();
    const { user } = useAuth();
    const { t } = useLanguage();
    const { showToast } = useToast();
    const [stationComponents, setStationComponents] = useState<Record<string, { id: string, name: string; condition: ComponentCondition; status: ComponentStatus; specs: string[]; logs: ItemLog[] }>>(
        mapItemsToComponents(station.items || [])
    );

    // Title editing state
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(station.name);

    // Auto-select component if provided
    const [selectedComponent, setSelectedComponent] = useState<string | null>(() => {
        if (initialSelectedComponent && stationComponents[initialSelectedComponent]) {
            return initialSelectedComponent;
        }
        return null;
    });
    // Sync state if props change (optional but good for robustness)
    useEffect(() => {
        setStationComponents(mapItemsToComponents(station.items || []));
    }, [station.items]);

    const [hoveredComponent, setHoveredComponent] = useState<ComponentType | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<{ name: string; condition: ComponentCondition; status: ComponentStatus; specs: string[] } | null>(null);
    const [isReporting, setIsReporting] = useState(false);
    const [reportReason, setReportReason] = useState('');

    useEffect(() => {
        setIsEditing(false);
        setEditForm(null);
        setIsReporting(false);
    }, [selectedComponent]);

    const handleComponentClick = (type: ComponentType) => {
        setSelectedComponent(type);
    };

    const handleSaveTitle = () => {
        if (editTitle.trim() && editTitle !== station.name) {
            onUpdate({ ...station, name: editTitle.trim() });
        } else {
            setEditTitle(station.name);
        }
        setIsEditingTitle(false);
    };

    const handleInitiateReport = () => {
        setIsReporting(true);
        setReportReason('');
    };

    const submitReport = async () => {
        if (!selectedComponent || !reportReason.trim()) return;
        const comp = stationComponents[selectedComponent];

        try {
            // 1. Create Service Request
            await addRequest({
                componentId: comp.id,
                componentName: comp.name,
                stationId: station.id,
                stationName: station.name,
                roomId: roomId ?? 'unknown',
                description: reportReason,
                requesterName: user?.name || 'Unknown User',
                componentCategory: 'Station Component', // Generic for station/visual parts
            });

            const updatedLogs = [
                createComponentLog('MAINTENANCE_REQUESTED', `Laporan maintenance dibuat: ${reportReason.trim()}`),
                ...ensureComponentLogs(comp?.logs)
            ];

            const updatedComponent = {
                ...comp,
                condition: 'service' as ComponentCondition,
                status: 'maintenance' as ComponentStatus,
                logs: updatedLogs
            };

            const nextComponents = {
                ...stationComponents,
                [selectedComponent]: updatedComponent
            };
            setStationComponents(nextComponents);

            const updatedItems = (station.items || []).map((item) =>
                String(item.id) === String(comp?.id)
                    ? { ...item, condition: 'service' as const, status: 'maintenance' as const, logs: updatedLogs }
                    : item
            );
            onUpdate({ ...station, items: updatedItems });

            showToast(t('report_success'), 'success');
            setIsReporting(false);
        } catch (error) {
            console.error('Failed to submit station report:', error);
            showToast('Gagal mengirim laporan ke backend.', 'error');
        }
    };

    const handleInitiateEdit = () => {
        if (!selectedComponent) return;
        const comp = stationComponents[selectedComponent];
        if (comp) {
            setEditForm({ ...comp });
        } else {
            // New component template
            setEditForm({ name: '', condition: 'good', status: 'available', specs: [''] });
        }
        setIsEditing(true);
    };

    const handleSave = () => {
        if (!selectedComponent || !editForm) return;

        const updatedSpecs = editForm.specs.filter(s => s.trim() !== '');
        const specsString = updatedSpecs.join(',');
        const previousLogs = ensureComponentLogs(stationComponents[selectedComponent]?.logs);
        const existingComponent = stationComponents[selectedComponent];
        const saveAction = existingComponent ? 'UPDATED' : 'CREATED';
        const saveDetails = saveAction === 'CREATED'
            ? `Komponen ${editForm.name || selectedComponent} ditambahkan.`
            : `Konfigurasi komponen ${editForm.name || selectedComponent} diperbarui.`;
        const nextLogs = [createComponentLog(saveAction, saveDetails), ...previousLogs];

        // Update local state for immediate feedback
        const updatedComponent = {
            ...stationComponents[selectedComponent],
            name: editForm.name || 'Unnamed Component',
            status: editForm.status,
            condition: editForm.condition,
            specs: updatedSpecs,
            type: selectedComponent === 'pc' ? 'PC Unit' : selectedComponent.charAt(0).toUpperCase() + selectedComponent.slice(1), // Simple type naming
            logs: nextLogs
        };

        const newComponents = {
            ...stationComponents,
            [selectedComponent]: updatedComponent
        };

        setStationComponents(newComponents);

        // Update parent container
        // We need to construct the full Item object list
        const newItems = station.items ? [...station.items] : [];
        const existingItemIndex = newItems.findIndex(i => {
            const t = normalizeType(i.type);
            if (selectedComponent === 'monitor' && ['monitor', 'screen'].includes(t)) return true;
            if (selectedComponent === 'pc' && ['pc', 'computer', 'pc unit'].includes(t)) return true;
            if (selectedComponent === 'keyboard' && ['keyboard'].includes(t)) return true;
            if (selectedComponent === 'mouse' && ['mouse'].includes(t)) return true;
            if (selectedComponent === 'desk' && ['desk', 'table', 'physical desk', 'workstation'].includes(t)) return true;
            return false;
        });

        const newItem: Item = {
            id: existingItemIndex >= 0 ? newItems[existingItemIndex].id : `item-${Date.now()}`,
            name: editForm.name,
            type: selectedComponent === 'pc' ? 'PC Unit' : selectedComponent.charAt(0).toUpperCase() + selectedComponent.slice(1),
            status: editForm.status,
            condition: editForm.condition, // Ensure condition is passed
            specs: specsString,
            logs: nextLogs
        };

        if (existingItemIndex >= 0) {
            newItems[existingItemIndex] = newItem;
        } else {
            newItems.push(newItem);
        }

        onUpdate({ ...station, items: newItems });
        setIsEditing(false);
    };

    const handleDelete = () => {
        if (!selectedComponent) return;

        // Remove from local state
        const newComps = { ...stationComponents };
        delete newComps[selectedComponent];
        setStationComponents(newComps);

        // Remove from parent container
        // Logic to identifying which item to delete based on selected slot
        const newItems = (station.items || []).filter(i => {
            const t = normalizeType(i.type);
            if (selectedComponent === 'monitor' && ['monitor', 'screen'].includes(t)) return false;
            if (selectedComponent === 'pc' && ['pc', 'computer', 'pc unit'].includes(t)) return false;
            if (selectedComponent === 'keyboard' && ['keyboard'].includes(t)) return false;
            if (selectedComponent === 'mouse' && ['mouse'].includes(t)) return false;
            if (selectedComponent === 'desk' && ['desk', 'table', 'physical desk', 'workstation'].includes(t)) return false;
            return true;
        });

        onUpdate({ ...station, items: newItems });
        setIsEditing(false);
        // We stay on the selected component, but now it will show as "Ghost" / Empty
    };

    const addSpecField = () => {
        if (!editForm) return;
        setEditForm({ ...editForm, specs: [...editForm.specs, ''] });
    };

    const removeSpecField = (index: number) => {
        if (!editForm) return;
        const newSpecs = editForm.specs.filter((_, i) => i !== index);
        setEditForm({ ...editForm, specs: newSpecs });
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4"
                onClick={(e) => e.target === e.currentTarget && onClose()}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] overflow-hidden flex flex-col md:flex-row border border-slate-700"
                >
                    {/* Visual Stage (Left) - Refactored to external component */}
                    <StationVisualizer
                        stationName={station.name}
                        stationComponents={stationComponents}
                        selectedComponent={selectedComponent}
                        hoveredComponent={hoveredComponent}
                        onSelectComponent={(type) => handleComponentClick(type as ComponentType)} // Cast needed if types mismatch slightly
                        onHoverComponent={(type) => setHoveredComponent(type as ComponentType)}
                    />

                    {/* Info Panel ({Right) */}
                    <div className="flex-1 bg-slate-900 border-l border-slate-700 p-8 flex flex-col relative z-20">
                        <div className="flex justify-between items-start mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-slate-800 rounded-lg border border-slate-700 shadow-inner">
                                    {renderActiveIcon(selectedComponent, hoveredComponent)}
                                </div>
                                <div>
                                    <h4 className="text-slate-400 text-xs uppercase tracking-wider font-semibold">
                                        {selectedComponent ? t('component_details') : t('station_status')}
                                    </h4>
                                    <div className="text-xl font-bold text-white flex items-center gap-2">
                                        {selectedComponent && <button onClick={() => setSelectedComponent(null)} className="hover:bg-slate-800 p-1 rounded-full"><ChevronLeft size={20} /></button>}
                                        {selectedComponent ? (
                                            stationComponents[selectedComponent]?.name || `${t('add_component')} ${selectedComponent}`
                                        ) : (
                                            isEditingTitle ? (
                                                <input
                                                    type="text"
                                                    value={editTitle}
                                                    onChange={(e) => setEditTitle(e.target.value)}
                                                    onBlur={handleSaveTitle}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()}
                                                    autoFocus
                                                    className="bg-slate-800 border border-indigo-500 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500 text-white w-auto min-w-[200px]"
                                                />
                                            ) : (
                                                <span
                                                    className="cursor-text hover:text-indigo-400 hover:underline decoration-dashed decoration-indigo-400 underline-offset-4 transition-colors"
                                                    onClick={() => setIsEditingTitle(true)}
                                                    title="Click to edit name"
                                                >
                                                    {station.name}
                                                </span>
                                            )
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Details Content */}
                        <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">

                            {/* Edit Form */}
                            {selectedComponent && isEditing && editForm ? (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-400 uppercase font-bold">{t('item_name')}</label>
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                            placeholder="Component Name"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs text-slate-400 uppercase font-bold">{t('col_status')}</label>
                                        <select
                                            value={editForm.status}
                                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ComponentStatus })}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none opacity-50 cursor-not-allowed"
                                            disabled
                                        >
                                            <option value="available">Available</option>
                                            <option value="in_use">In Use</option>
                                            <option value="maintenance">Maintenance</option>
                                            <option value="missing">Missing</option>
                                        </select>
                                        <p className="text-[10px] text-slate-500 pt-1">{t('status_managed_hint')}</p>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-xs text-slate-400 uppercase font-bold">Specs</label>
                                            <button onClick={addSpecField} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                                                <Plus size={12} /> {t('add_custom_param')}
                                            </button>
                                        </div>
                                        <div className="space-y-2">
                                            {editForm.specs.map((spec, i) => {
                                                const [label, value] = spec.includes(':')
                                                    ? spec.split(':').map(s => s.trim())
                                                    : ['', spec];

                                                return (
                                                    <div key={i} className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={label}
                                                            onChange={(e) => {
                                                                const newSpecs = [...editForm.specs];
                                                                // Reconstruct string with new label but keep old value
                                                                const currentVal = newSpecs[i].includes(':') ? newSpecs[i].split(':')[1].trim() : newSpecs[i];
                                                                newSpecs[i] = `${e.target.value}: ${currentVal}`;
                                                                setEditForm({ ...editForm, specs: newSpecs });
                                                            }}
                                                            className="w-1/3 bg-slate-800 border border-slate-700 rounded-lg p-2 text-indigo-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none font-medium"
                                                            placeholder="Parameter"
                                                        />
                                                        <input
                                                            type="text"
                                                            value={value}
                                                            onChange={(e) => {
                                                                const newSpecs = [...editForm.specs];
                                                                // Reconstruct string with old label but new value
                                                                const currentLabel = newSpecs[i].includes(':') ? newSpecs[i].split(':')[0].trim() : '';
                                                                newSpecs[i] = `${currentLabel}: ${e.target.value}`;
                                                                setEditForm({ ...editForm, specs: newSpecs });
                                                            }}
                                                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                                                            placeholder="Value (e.g., 144Hz)"
                                                        />
                                                        <button onClick={() => removeSpecField(i)} className="text-slate-500 hover:text-rose-400 p-2">
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        <button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2">
                                            <Save size={16} /> {t('save')}
                                        </button>
                                        <button onClick={() => setIsEditing(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-medium text-sm">
                                            {t('btn_cancel')}
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {/* View Mode */}
                            {selectedComponent && !isEditing && stationComponents[selectedComponent] ? (
                                <div className="space-y-6">
                                    {/* Status Card */}
                                    <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm text-slate-400 flex items-center gap-2">
                                                <Activity size={14} /> {t('condition')}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${stationComponents[selectedComponent].condition === 'good'
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : stationComponents[selectedComponent].condition === 'service' ? 'bg-amber-500/20 text-amber-400'
                                                    : 'bg-rose-500/20 text-rose-400'
                                                }`}>
                                                {t(stationComponents[selectedComponent].condition)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-slate-400 flex items-center gap-2">
                                                <Clock size={14} /> {t('uptime')}
                                            </span>
                                            <span className="text-sm text-white font-mono">48 Hours</span>
                                        </div>
                                    </div>

                                    {/* Specs / Details */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="space-y-3"
                                    >
                                        <h5 className="text-xs text-slate-500 uppercase tracking-widest font-bold border-b border-slate-800 pb-2">{t('technical_specs')}</h5>
                                        {stationComponents[selectedComponent].specs.length > 0 ? stationComponents[selectedComponent].specs.map((spec, i) => {
                                            const [label, value] = spec.includes(':')
                                                ? spec.split(':').map(s => s.trim())
                                                : ['', spec];

                                            if (!label && !value) return null;

                                            return (
                                                <div key={i} className="flex items-center justify-between group border-b border-slate-800/50 pb-2 last:border-0 last:pb-0">
                                                    <span className="text-sm text-slate-400 group-hover:text-indigo-300 transition-colors flex items-center">
                                                        <ChevronRight size={12} className="inline mr-2 opacity-50" />
                                                        {label}
                                                    </span>
                                                    <span className="text-sm text-white font-mono">{value}</span>
                                                </div>
                                            );
                                        }) : <p className="text-sm text-slate-600 italic">{t('no_specs')}</p>}
                                    </motion.div>

                                    <div className="space-y-3">
                                        <h5 className="text-xs text-slate-500 uppercase tracking-widest font-bold border-b border-slate-800 pb-2">
                                            {t('component_history')}
                                        </h5>
                                        <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                            {ensureComponentLogs(stationComponents[selectedComponent].logs)
                                                .filter((log) => log.action !== 'INITIALIZED')
                                                .map((log) => (
                                                <div key={log.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                                                    <div className="text-[11px] text-slate-400">
                                                        {new Date(log.date).toLocaleDateString()} | {new Date(log.date).toLocaleTimeString()}
                                                    </div>
                                                    <div className="text-xs font-semibold text-white mt-1">{formatActionLabel(log.action)}</div>
                                                    <div className="text-xs text-slate-300 mt-1">
                                                        {formatLogDetails(log.action, log.details)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 pt-2">
                                        <button onClick={handleInitiateReport} className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/50 text-amber-500 py-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2">
                                            <AlertTriangle size={16} /> {t('report_issue')}
                                        </button>
                                    </div>

                                    {/* Edit/Delete (Admin/Advanced only - visually separated) */}
                                    <div className="flex gap-3 pt-2 border-t border-slate-800 mt-4">
                                        <button onClick={handleInitiateEdit} className="flex-1 text-xs text-slate-500 hover:text-indigo-400 py-2 font-medium transition-all text-left">
                                            {t('edit_config')}
                                        </button>
                                        <button onClick={handleDelete} className="text-xs text-slate-500 hover:text-rose-400 py-2 font-medium transition-all">
                                            {t('remove_component')}
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                            {/* Report Issue Modal Overlay - Inside Panel */}
                            {isReporting && (
                                <div className="absolute inset-0 bg-slate-900/95 z-50 flex flex-col p-6 animate-in fade-in duration-200">
                                    <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                        <AlertTriangle className="text-amber-500" /> {t('report_issue_title')}
                                    </h4>
                                    <p className="text-sm text-slate-400 mb-4">{t('report_issue_desc')}</p>
                                    <textarea
                                        value={reportReason}
                                        onChange={(e) => setReportReason(e.target.value)}
                                        className="w-full h-32 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none mb-4"
                                        placeholder="E.g., Screen flickering, Key stuck, Device not responding..."
                                    />
                                    <div className="flex gap-3 mt-auto">
                                        <button onClick={() => { void submitReport(); }} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white py-2 rounded-lg font-medium">{t('submit_report')}</button>
                                        <button onClick={() => setIsReporting(false)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg">{t('btn_cancel')}</button>
                                    </div>
                                </div>
                            )}


                            {/* Empty/Ghost State Selected - Now mostly purely for fallback if selected in weird state */}
                            {selectedComponent && !stationComponents[selectedComponent] && !isEditing && (
                                <div className="text-center py-10 space-y-4">
                                    {/* This might be reachable if we manually set generic component, 
                                        but with ghost slots gone, it's less reachable from map. 
                                        We'll keep it as the 'Add' form trigger just in case. */}
                                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-600">
                                        <Plus size={32} className="text-slate-500" />
                                    </div>
                                    <h4 className="text-lg font-medium text-white">{t('add_component')} {selectedComponent}</h4>
                                    <p className="text-sm text-slate-500">Configure this component to add it to the station.</p>
                                    <button onClick={handleInitiateEdit} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                                        {t('edit_config')}
                                    </button>
                                </div>
                            )}

                            {!selectedComponent && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="space-y-6"
                                >
                                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
                                        <h4 className="text-sm font-bold text-white mb-2">{t('station_components')}</h4>
                                        <p className="text-xs text-slate-400 mb-4">
                                            {t('station_components_desc')}
                                        </p>

                                        {/* List installed components */}
                                        <div className="space-y-2">
                                            {Object.keys(stationComponents).length > 0 ? (
                                                Object.entries(stationComponents).map(([key, comp]) => (
                                                    <div key={key}
                                                        className="flex items-center justify-between p-2 bg-slate-800 rounded border border-slate-700 cursor-pointer hover:border-indigo-500 transition-colors"
                                                        onClick={() => setSelectedComponent(key as ComponentType)}
                                                    >
                                                        <span className="text-sm text-white capitalize">{comp.name}</span>
                                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${comp.condition === 'good' ? 'bg-emerald-500/20 text-emerald-400' :
                                                            comp.condition === 'service' ? 'bg-amber-500/20 text-amber-400' :
                                                                'bg-rose-500/20 text-rose-400'
                                                            }`}>{comp.condition}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs text-slate-500 italic text-center py-2">{t('no_components_installed')}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Add Missing Components Section */}
                                    <div className="space-y-3">
                                        <h5 className="text-xs text-slate-500 uppercase tracking-widest font-bold">{t('add_component')}</h5>
                                        <div className="grid grid-cols-2 gap-3">
                                            {!stationComponents['desk'] && (
                                                <button
                                                    onClick={() => { setSelectedComponent('desk'); handleInitiateEdit(); }}
                                                    className="p-3 bg-slate-800 border border-slate-700 hover:bg-indigo-900/20 hover:border-indigo-500/50 rounded-lg flex flex-col items-center gap-2 transition-all group col-span-2"
                                                >
                                                    <Maximize size={24} className="text-slate-400 group-hover:text-indigo-400" />
                                                    <span className="text-xs font-medium text-slate-300 group-hover:text-white">{t('add_physical_desk')}</span>
                                                </button>
                                            )}
                                            {!stationComponents['monitor'] && (
                                                <button
                                                    onClick={() => { setSelectedComponent('monitor'); handleInitiateEdit(); }}
                                                    className="p-3 bg-slate-800 border border-slate-700 hover:bg-indigo-900/20 hover:border-indigo-500/50 rounded-lg flex flex-col items-center gap-2 transition-all group"
                                                >
                                                    <Monitor size={24} className="text-slate-400 group-hover:text-indigo-400" />
                                                    <span className="text-xs font-medium text-slate-300 group-hover:text-white">{t('add_monitor')}</span>
                                                </button>
                                            )}
                                            {!stationComponents['pc'] && (
                                                <button
                                                    onClick={() => { setSelectedComponent('pc'); handleInitiateEdit(); }}
                                                    className="p-3 bg-slate-800 border border-slate-700 hover:bg-indigo-900/20 hover:border-indigo-500/50 rounded-lg flex flex-col items-center gap-2 transition-all group"
                                                >
                                                    <Cpu size={24} className="text-slate-400 group-hover:text-indigo-400" />
                                                    <span className="text-xs font-medium text-slate-300 group-hover:text-white">{t('add_pc')}</span>
                                                </button>
                                            )}
                                            {!stationComponents['keyboard'] && (
                                                <button
                                                    onClick={() => { setSelectedComponent('keyboard'); handleInitiateEdit(); }}
                                                    className="p-3 bg-slate-800 border border-slate-700 hover:bg-indigo-900/20 hover:border-indigo-500/50 rounded-lg flex flex-col items-center gap-2 transition-all group"
                                                >
                                                    <Keyboard size={24} className="text-slate-400 group-hover:text-indigo-400" />
                                                    <span className="text-xs font-medium text-slate-300 group-hover:text-white">{t('add_keyboard')}</span>
                                                </button>
                                            )}
                                            {!stationComponents['mouse'] && (
                                                <button
                                                    onClick={() => { setSelectedComponent('mouse'); handleInitiateEdit(); }}
                                                    className="p-3 bg-slate-800 border border-slate-700 hover:bg-indigo-900/20 hover:border-indigo-500/50 rounded-lg flex flex-col items-center gap-2 transition-all group"
                                                >
                                                    <Mouse size={24} className="text-slate-400 group-hover:text-indigo-400" />
                                                    <span className="text-xs font-medium text-slate-300 group-hover:text-white">{t('add_mouse')}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>

                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default StationDetailModal;
