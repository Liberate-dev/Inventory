import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';
import { getAuthHeaders } from '../../utils/api';
import {
  DEFAULT_DOCUMENT_NUMBER_SETTINGS,
  buildDocumentNumber,
  type DocumentNumberSettings
} from '../../utils/assetDocumentNumber';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api');
const DOCUMENT_NUMBERS_ENDPOINT = `${API_BASE_URL}/assets/document_numbers.php`;

export default function DocumentNumberManagementPage() {
  const { user } = useAuth();
  const { canEditFeature } = useAccessMatrix();
  const [settings, setSettings] = useState<DocumentNumberSettings>(DEFAULT_DOCUMENT_NUMBER_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canManage = user ? canEditFeature('asset_accounting', user.role) : false;

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(DOCUMENT_NUMBERS_ENDPOINT, {
        headers: getAuthHeaders()
      });
      const payload = await response.json().catch(() => ({})) as {
        status?: string;
        settings?: Partial<DocumentNumberSettings>;
        message?: string;
      };

      if (!response.ok || payload.status !== 'success' || !payload.settings) {
        throw new Error(payload.message || 'Gagal memuat pengaturan nomor dokumen.');
      }

      setSettings({
        ...DEFAULT_DOCUMENT_NUMBER_SETTINGS,
        ...payload.settings
      });
      setFeedback(null);
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Gagal memuat pengaturan nomor dokumen.'
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
      if (!canManage) {
        throw new Error('Mode akses Anda hanya baca untuk pengaturan nomor dokumen.');
      }

      const response = await fetch(DOCUMENT_NUMBERS_ENDPOINT, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(settings)
      });
      const payload = await response.json().catch(() => ({})) as {
        status?: string;
        settings?: Partial<DocumentNumberSettings>;
        message?: string;
      };

      if (!response.ok || payload.status !== 'success') {
        throw new Error(payload.message || 'Gagal menyimpan pengaturan nomor dokumen.');
      }

      if (payload.settings) {
        setSettings({
          ...DEFAULT_DOCUMENT_NUMBER_SETTINGS,
          ...payload.settings
        });
      }

      setFeedback({
        type: 'success',
        message: payload.message || 'Pengaturan nomor dokumen tersimpan.'
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Gagal menyimpan pengaturan nomor dokumen.'
      });
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(
    () => buildDocumentNumber(settings, settings.nextNumber, new Date().toISOString().slice(0, 10)),
    [settings]
  );

  const previewPattern = useMemo(() => {
    const parts: string[] = [];
    if (settings.prefix.trim()) parts.push('{PREFIX}');
    if (settings.yearFormat !== 'none') parts.push('{TAHUN}');
    parts.push('{NOMOR-URUT}');
    return parts.join(settings.separator || '-');
  }, [settings]);

  return (
    <div className="space-y-6">
      {feedback && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${feedback.type === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-rose-200 bg-rose-50 text-rose-700'
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Format Nomor Dokumen</h3>

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
                    onChange={(event) => setSettings((prev) => ({ ...prev, prefix: event.target.value.toUpperCase().slice(0, 20) }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20 outline-none font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Separator</label>
                  <input
                    type="text"
                    value={settings.separator}
                    onChange={(event) => setSettings((prev) => ({ ...prev, separator: event.target.value.slice(0, 3) || '-' }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Format Tahun</label>
                  <select
                    value={settings.yearFormat}
                    onChange={(event) => setSettings((prev) => ({ ...prev, yearFormat: event.target.value as DocumentNumberSettings['yearFormat'] }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20 outline-none"
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
                    onChange={(event) => setSettings((prev) => ({ ...prev, sequencePadding: Math.min(8, Math.max(2, Number(event.target.value) || 4)) }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nomor Urut Berikutnya</label>
                  <input
                    type="number"
                    min={1}
                    value={settings.nextNumber}
                    onChange={(event) => setSettings((prev) => ({ ...prev, nextNumber: Math.max(1, Number(event.target.value) || 1) }))}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => { void saveSettings(); }}
                  disabled={saving || !canManage}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#000080] text-white rounded-lg font-bold hover:bg-[#000060] disabled:opacity-60"
                >
                  {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                  Simpan Pengaturan
                </button>
                <button
                  onClick={() => { void loadSettings(); }}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw size={16} />
                  Muat Ulang
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Preview</h3>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3 font-mono text-indigo-700 text-sm break-all">
            {preview}
          </div>
          <p className="text-xs text-slate-500">
            Template: <span className="font-mono text-slate-700">{previewPattern}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
