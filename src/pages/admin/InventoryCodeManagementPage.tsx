import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Wand2 } from 'lucide-react';
import { buildInventoryCode, DEFAULT_INVENTORY_CODE_SETTINGS, deriveRoomCode, type InventoryCodeSettings } from '../../utils/inventoryCode';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/public/api').replace(/\/+$/, '');
const INVENTORY_CODES_ENDPOINT = `${API_BASE_URL}/inventory/inventory_codes.php`;

type NormalizeMode = 'all' | 'missing';

interface InventoryCodeManagementPageProps {
    embedded?: boolean;
}

const InventoryCodeManagementPage = ({ embedded = false }: InventoryCodeManagementPageProps) => {
    const [settings, setSettings] = useState<InventoryCodeSettings>(DEFAULT_INVENTORY_CODE_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [normalizing, setNormalizing] = useState<NormalizeMode | null>(null);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const response = await fetch(INVENTORY_CODES_ENDPOINT);
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

    useEffect(() => {
        void loadSettings();
    }, []);

    const saveSettings = async () => {
        setSaving(true);
        try {
            const response = await fetch(INVENTORY_CODES_ENDPOINT, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
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
            const response = await fetch(INVENTORY_CODES_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
                                    disabled={saving}
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
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Normalisasi</h3>
                        <p className="text-xs text-slate-500 mb-3">
                            Terapkan format ini ke data item yang sudah ada.
                        </p>
                        <div className="space-y-2">
                            <button
                                onClick={() => { void runNormalization('all'); }}
                                disabled={normalizing !== null}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 disabled:opacity-60"
                            >
                                {normalizing === 'all' ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                Normalisasi Semua Item
                            </button>
                            <button
                                onClick={() => { void runNormalization('missing'); }}
                                disabled={normalizing !== null}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-60"
                            >
                                {normalizing === 'missing' ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                Normalisasi Kode Kosong
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InventoryCodeManagementPage;
