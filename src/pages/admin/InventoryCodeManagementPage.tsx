import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Wand2, ChevronDown, ChevronUp, Search, Package, Settings2 } from 'lucide-react';
import { buildInventoryCode, DEFAULT_INVENTORY_CODE_SETTINGS, deriveRoomCode, buildFallbackSmartCode, type InventoryCodeSettings } from '../../utils/inventoryCode';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';
import { getAuthHeaders } from '../../utils/api';
import { generateSmartCodeWithAI, getAIStatus } from '../../utils/aiClient';
import { ItemStatusBadge } from '../../components/common/ItemStatusBadge';
import { getProcurementDateFromLogs } from '../../utils/itemHistory';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api').replace(/\/+$/, '');
const INVENTORY_CODES_ENDPOINT = `${API_BASE_URL}/inventory/inventory_codes.php`;

type NormalizeMode = 'all' | 'missing';

interface InventoryCodeManagementPageProps {
    embedded?: boolean;
}

const InventoryCodeManagementPage = ({ embedded = false }: InventoryCodeManagementPageProps) => {
    const { refreshRooms } = useInventory();
    const { user } = useAuth();
    const { canEditFeature } = useAccessMatrix();
    
    const [settings, setSettings] = useState<InventoryCodeSettings>(DEFAULT_INVENTORY_CODE_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [normalizing, setNormalizing] = useState<NormalizeMode | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    
    // AI Auto-Manage state
    const [aiManaging, setAiManaging] = useState(false);
    const [aiProgress, setAiProgress] = useState({ current: 0, total: 0 });
    
    // Items table state
    const [items, setItems] = useState<any[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [search, setSearch] = useState('');
    const [settingsExpanded, setSettingsExpanded] = useState(false); // Collapsed by default

    const canManageCodes = user ? canEditFeature('item_management', user.role) : false;

    const loadSettings = async () => {
        setLoading(true);
        try {
            const response = await fetch(INVENTORY_CODES_ENDPOINT, {
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({})) as {
                status?: string;
                settings?: Partial<InventoryCodeSettings>;
                message?: string;
            };

            if (!response.ok || payload.status !== 'success' || !payload.settings) {
                throw new Error(payload.message || 'Gagal memuat pengaturan kode inventaris.');
            }

            setSettings({
                ...DEFAULT_INVENTORY_CODE_SETTINGS,
                ...payload.settings
            });
            setFeedback(null);
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Gagal memuat pengaturan kode inventaris.'
            });
        } finally {
            setLoading(false);
        }
    };

    const fetchItems = async () => {
        setLoadingItems(true);
        try {
            const response = await fetch(`${API_BASE_URL}/inventory/items_management.php`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (response.ok && data.status === 'success') {
                setItems(data.items || []);
            }
        } catch (err) {
            console.error('Gagal mengambil daftar barang:', err);
        } finally {
            setLoadingItems(false);
        }
    };

    useEffect(() => {
        void loadSettings();
        void fetchItems();
    }, []);

    const saveSettings = async () => {
        setSaving(true);
        try {
            if (!canManageCodes) {
                throw new Error('Mode akses Anda hanya baca untuk pengaturan kode inventaris.');
            }

            const response = await fetch(INVENTORY_CODES_ENDPOINT, {
                method: 'PUT',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(settings)
            });
            const payload = await response.json().catch(() => ({})) as {
                status?: string;
                settings?: Partial<InventoryCodeSettings>;
                message?: string;
            };

            if (!response.ok || payload.status !== 'success') {
                throw new Error(payload.message || 'Gagal menyimpan pengaturan.');
            }

            if (payload.settings) {
                setSettings({
                    ...DEFAULT_INVENTORY_CODE_SETTINGS,
                    ...payload.settings
                });
            }

            setFeedback({
                type: 'success',
                message: payload.message || 'Pengaturan kode inventaris berhasil disimpan.'
            });
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Gagal menyimpan pengaturan.'
            });
        } finally {
            setSaving(false);
        }
    };

    const runNormalization = async (mode: NormalizeMode) => {
        setNormalizing(mode);
        try {
            if (!canManageCodes) {
                throw new Error('Mode akses Anda hanya baca untuk normalisasi kode inventaris.');
            }

            const response = await fetch(INVENTORY_CODES_ENDPOINT, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    action: 'normalize',
                    mode
                })
            });
            const payload = await response.json().catch(() => ({})) as {
                status?: string;
                message?: string;
                result?: {
                    updated?: number;
                    total?: number;
                    nextNumber?: number;
                };
                settings?: Partial<InventoryCodeSettings>;
            };

            if (!response.ok || payload.status !== 'success') {
                throw new Error(payload.message || 'Normalisasi kode inventaris gagal.');
            }

            if (payload.settings) {
                setSettings({
                    ...DEFAULT_INVENTORY_CODE_SETTINGS,
                    ...payload.settings
                });
            } else if (payload.result?.nextNumber) {
                setSettings((prev) => ({ ...prev, nextNumber: payload.result?.nextNumber ?? prev.nextNumber }));
            }

            const updated = payload.result?.updated ?? 0;
            const total = payload.result?.total ?? 0;

            try {
                await refreshRooms();
                void fetchItems();
            } catch {
                // Ignore cache refresh failure
            }

            setFeedback({
                type: 'success',
                message: `Normalisasi selesai: ${updated} dari ${total} item diperbarui.`
            });
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Normalisasi kode inventaris gagal.'
            });
        } finally {
            setNormalizing(null);
        }
    };

    const handleAIAutoManage = async () => {
        setAiManaging(true);
        setFeedback(null);
        try {
            // 1. Fetch active items
            const activeItems = items.filter((item: any) => !item.deleted_at);
            if (activeItems.length === 0) {
                setFeedback({ type: 'success', message: 'Tidak ada item aktif yang perlu diproses.' });
                return;
            }

            setAiProgress({ current: 0, total: activeItems.length });

            // 2. Loop and generate SKU for each item
            for (let i = 0; i < activeItems.length; i++) {
                const item = activeItems[i];
                let generatedSku = '';
                try {
                    // Try generating with AI
                    const aiResult = await generateSmartCodeWithAI(
                        item.name,
                        item.itemTypeName || item.type,
                        item.room_name,
                        item.category
                    );
                    generatedSku = aiResult.suggestedSku;
                } catch (aiErr) {
                    console.warn(`AI SKU failed for item ${item.name}, falling back to smart formula:`, aiErr);
                    generatedSku = buildFallbackSmartCode(item.room_name, item.name, settings.nextNumber + i, settings.sequencePadding);
                }

                // Save to backend using items_management update_sku action
                const updateRes = await fetch(`${API_BASE_URL}/inventory/items_management.php`, {
                    method: 'POST',
                    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({
                        action: 'update_sku',
                        item_id: item.id,
                        sku: generatedSku
                    })
                });

                const updateData = await updateRes.json().catch(() => ({}));
                if (!updateRes.ok || updateData.status !== 'success') {
                    console.error(`Failed to update SKU for item ${item.id}:`, updateData.message);
                }

                setAiProgress(prev => ({ ...prev, current: i + 1 }));
                // Tiny delay to respect API rate limits and show UI progress smoothly
                await new Promise(r => setTimeout(r, 250));
            }

            // Sync inventory cache and refresh list
            try {
                await refreshRooms();
                void fetchItems();
            } catch {
                // Ignore cache refresh failure
            }

            setFeedback({
                type: 'success',
                message: `Auto-Manage AI selesai: ${activeItems.length} item berhasil diproses dengan kode pintar.`
            });
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Auto-Manage AI gagal dilaksanakan.'
            });
        } finally {
            setAiManaging(false);
            setAiProgress({ current: 0, total: 0 });
        }
    };

    const handleSingleAIAutoManage = async (item: any) => {
        try {
            setFeedback(null);
            let generatedSku = '';
            try {
                const aiResult = await generateSmartCodeWithAI(
                    item.name,
                    item.itemTypeName || item.type,
                    item.room_name,
                    item.category
                );
                generatedSku = aiResult.suggestedSku;
            } catch (aiErr) {
                console.warn(`AI SKU failed, using smart formula:`, aiErr);
                generatedSku = buildFallbackSmartCode(item.room_name, item.name, settings.nextNumber, settings.sequencePadding);
            }

            const response = await fetch(`${API_BASE_URL}/inventory/items_management.php`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    action: 'update_sku',
                    item_id: item.id,
                    sku: generatedSku
                })
            });

            const data = await response.json().catch(() => ({}));
            if (response.ok && data.status === 'success') {
                setFeedback({ type: 'success', message: `Kode barang "${item.name}" diperbarui ke "${generatedSku}".` });
                void fetchItems();
                void refreshRooms();
            } else {
                throw new Error(data.message || 'Gagal memperbarui SKU.');
            }
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Gagal memproses AI.'
            });
        }
    };

    const handleUpdateSku = async (itemId: string, newSku: string) => {
        try {
            setFeedback(null);
            const response = await fetch(`${API_BASE_URL}/inventory/items_management.php`, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    action: 'update_sku',
                    item_id: itemId,
                    sku: newSku
                })
            });

            const data = await response.json().catch(() => ({}));
            if (response.ok && data.status === 'success') {
                void fetchItems();
                void refreshRooms();
            } else {
                throw new Error(data.message || 'Gagal memperbarui SKU.');
            }
        } catch (error) {
            setFeedback({
                type: 'error',
                message: error instanceof Error ? error.message : 'Gagal memperbarui SKU.'
            });
        }
    };

    const preview = useMemo(() => {
        const sampleRoomCode = deriveRoomCode('Lab Komputer 2');
        return buildInventoryCode(settings, settings.nextNumber, sampleRoomCode);
    }, [settings]);

    const previewNoRoom = useMemo(() => {
        return buildInventoryCode(settings, settings.nextNumber, '');
    }, [settings]);

    const previewPattern = useMemo(() => {
        const parts: string[] = [];
        if (settings.prefix.trim()) parts.push('{PREFIX}');
        if (settings.yearFormat !== 'none') parts.push('{TAHUN}');
        if (settings.includeRoomCode) parts.push('{KODE-RUANG}');
        parts.push('{NOMOR-URUT}');
        return parts.join(settings.separator || '-');
    }, [settings]);

    const filteredItems = items.filter(item => {
        const q = search.toLowerCase();
        return item.name.toLowerCase().includes(q) ||
            (item.sku && item.sku.toLowerCase().includes(q)) ||
            (item.room_name && item.room_name.toLowerCase().includes(q));
    });

    const formatDateId = (value?: string) => {
        if (!value || value === '-') return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('id-ID');
    };

    const aiStatus = getAIStatus();

    return (
        <div className="space-y-6">
            {!embedded && (
                <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-extrabold text-[#000080] tracking-tight">Manajemen Kode Inventaris</h2>
                    <p className="text-sm text-slate-500">
                        Atur patokan auto-generate kode inventaris dan normalisasi kode item yang sudah ada.
                    </p>
                </div>
            )}

            {feedback && (
                <div className={`rounded-xl border px-4 py-3 text-sm ${feedback.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-rose-200 bg-rose-50 text-rose-700'
                    }`}>
                    {feedback.message}
                </div>
            )}

            {/* AI Auto-Manage Sleek Header Panel */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                            <Wand2 size={16} className="text-indigo-600 animate-pulse" />
                            AI Auto-Manage Label & SKU
                        </h3>
                        <p className="text-xs text-slate-500">
                            Gunakan AI untuk menghasilkan kode inventaris (SKU) secara pintar untuk semua item aktif dalam sekali klik.
                        </p>
                        <p className="text-[11px] text-slate-500">
                            <strong>Rumus AI:</strong> <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-700">[Ruangan]-[Nama Barang]-[Nomor Urut]</code> (Contoh: <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">LAB-MEJ-003</code>)
                        </p>
                        <div className={`inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            aiStatus.available
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${aiStatus.available ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            {aiStatus.available ? `AI: ${aiStatus.label}` : 'Fallback (set API key di .env)'}
                        </div>
                    </div>

                    <div className="self-start md:self-auto min-w-[200px] flex flex-col gap-2">
                        <button
                            onClick={handleAIAutoManage}
                            disabled={aiManaging || normalizing !== null || !canManageCodes}
                            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md transition-all disabled:opacity-60 text-sm"
                        >
                            {aiManaging ? (
                                <>
                                    <RefreshCw size={16} className="animate-spin" />
                                    {`Memproses AI... (${aiProgress.current}/${aiProgress.total})`}
                                </>
                            ) : (
                                <>
                                    <Wand2 size={16} />
                                    Auto Label AI
                                </>
                            )}
                        </button>
                        {aiManaging && aiProgress.total > 0 && (
                            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                                    style={{ width: `${(aiProgress.current / aiProgress.total) * 100}%` }}
                                ></div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Collapsible Format Settings & Manual Normalization */}
            <div className="space-y-3">
                <button
                    onClick={() => setSettingsExpanded(!settingsExpanded)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 transition-colors"
                >
                    <span className="flex items-center gap-2 font-bold text-sm text-slate-700">
                        <Settings2 size={16} className="text-slate-500" />
                        Pengaturan Format Kode & Normalisasi Manual
                    </span>
                    {settingsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {settingsExpanded && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 transition-all">
                        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Format Kode</h3>

                            {loading ? (
                                <div className="text-sm text-slate-500 flex items-center gap-2">
                                    <RefreshCw size={16} className="animate-spin" />
                                    Memuat pengaturan...
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Prefix</label>
                                            <input
                                                type="text"
                                                value={settings.prefix}
                                                onChange={(e) => setSettings((prev) => ({ ...prev, prefix: e.target.value.toUpperCase().slice(0, 20) }))}
                                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono uppercase"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Separator</label>
                                            <input
                                                type="text"
                                                value={settings.separator}
                                                onChange={(e) => setSettings((prev) => ({ ...prev, separator: e.target.value.slice(0, 3) || '-' }))}
                                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Format Tahun</label>
                                            <select
                                                value={settings.yearFormat}
                                                onChange={(e) => setSettings((prev) => ({ ...prev, yearFormat: e.target.value as InventoryCodeSettings['yearFormat'] }))}
                                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                            >
                                                <option value="none">Tanpa Tahun</option>
                                                <option value="2">2 Digit (26)</option>
                                                <option value="4">4 Digit (2026)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Panjang Nomor Urut</label>
                                            <input
                                                type="number"
                                                min={2}
                                                max={8}
                                                value={settings.sequencePadding}
                                                onChange={(e) => setSettings((prev) => ({ ...prev, sequencePadding: Math.min(8, Math.max(2, Number(e.target.value) || 4)) }))}
                                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nomor Urut Berikutnya</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={settings.nextNumber}
                                                onChange={(e) => setSettings((prev) => ({ ...prev, nextNumber: Math.max(1, Number(e.target.value) || 1) }))}
                                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                                            />
                                        </div>
                                    </div>

                                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={settings.includeRoomCode}
                                            onChange={(e) => setSettings((prev) => ({ ...prev, includeRoomCode: e.target.checked }))}
                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        Sertakan kode ruangan (contoh: LK2)
                                    </label>

                                    <div className="flex flex-wrap gap-3 pt-2">
                                        <button
                                            onClick={() => { void saveSettings(); }}
                                            disabled={saving || !canManageCodes}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#000080] text-white rounded-xl font-bold hover:bg-[#000060] disabled:opacity-60"
                                        >
                                            {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                                            Simpan Pengaturan
                                        </button>
                                        <button
                                            onClick={() => { void loadSettings(); }}
                                            disabled={loading}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-50 disabled:opacity-60"
                                        >
                                            <RefreshCw size={16} />
                                            Muat Ulang
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Preview</h3>
                                <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-3 font-mono text-indigo-700 text-sm break-all">
                                    {preview}
                                </div>
                                <div className="mt-2 text-xs text-slate-500 space-y-1">
                                    <p>Template: <span className="font-mono text-slate-700">{previewPattern}</span></p>
                                    {settings.includeRoomCode && (
                                        <p>Tanpa kode ruangan: <span className="font-mono text-slate-700">{previewNoRoom}</span></p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Normalisasi Manual</h3>
                                <p className="text-xs text-slate-500 mb-3">
                                    Terapkan format pengaturan ini ke data item yang sudah ada.
                                </p>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => { void runNormalization('all'); }}
                                        disabled={normalizing !== null || !canManageCodes}
                                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-60"
                                    >
                                        {normalizing === 'all' ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                        Normalisasi Semua Item
                                    </button>
                                    <button
                                        onClick={() => { void runNormalization('missing'); }}
                                        disabled={normalizing !== null || !canManageCodes}
                                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-60"
                                    >
                                        {normalizing === 'missing' ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                        Normalisasi Kode Kosong
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* List of Items for Code Management */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider self-start md:self-center">
                        Daftar Kode Barang
                    </h3>

                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Cari barang..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                        />
                    </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 font-semibold text-slate-700 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 whitespace-nowrap">Nama Barang</th>
                                <th className="px-4 py-3 whitespace-nowrap">Kode/SKU</th>
                                <th className="px-4 py-3 whitespace-nowrap">Lokasi</th>
                                <th className="px-4 py-3 whitespace-nowrap">Tanggal</th>
                                <th className="px-4 py-3 whitespace-nowrap min-w-[150px]">Status</th>
                                <th className="px-4 py-3 whitespace-nowrap">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loadingItems ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                        <RefreshCw size={16} className="animate-spin inline mr-2" />
                                        Memuat data barang...
                                    </td>
                                </tr>
                            ) : filteredItems.map(item => (
                                <tr key={item.id} className={`hover:bg-slate-50 ${item.deleted_at ? 'bg-rose-50/30 text-slate-500' : ''}`}>
                                    <td className="px-4 py-3">
                                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                                            <Package size={16} className={item.deleted_at ? 'text-rose-400' : 'text-indigo-400'} />
                                            {item.name}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <input
                                            type="text"
                                            value={item.sku || ''}
                                            disabled={!canManageCodes}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setItems(prev => prev.map(it => it.id === item.id ? { ...it, sku: val } : it));
                                            }}
                                            onBlur={(e) => {
                                                void handleUpdateSku(item.id, e.target.value);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.currentTarget.blur();
                                                }
                                            }}
                                            placeholder="INV-..."
                                            className="w-full max-w-[200px] px-2 py-1 font-mono text-xs font-semibold text-indigo-700 bg-indigo-50/20 border border-indigo-100 hover:border-indigo-300 focus:border-indigo-500 focus:bg-white rounded outline-none transition-all"
                                            title="Klik untuk mengedit kode secara manual"
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        {item.room_name}
                                        {item.container_name ? ` - ${item.container_name}` : ''}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {formatDateId(getProcurementDateFromLogs(item.logs, item.created_at))}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <ItemStatusBadge status={item.status} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2" title="Aksi">
                                            {canManageCodes && !item.deleted_at && (
                                                <button
                                                    onClick={() => { void handleSingleAIAutoManage(item); }}
                                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-100"
                                                    title="Regenerasi SKU dengan AI"
                                                >
                                                    <Wand2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!loadingItems && filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                        Tidak ada barang yang ditemukan.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default InventoryCodeManagementPage;
