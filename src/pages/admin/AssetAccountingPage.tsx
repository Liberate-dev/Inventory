import { useEffect, useState, type ReactNode } from 'react';
import { useAssetAccounting, type Asset, type AssetCategory, type FundingSource } from '../../context/AssetAccountingContext';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';
import { getAuthHeaders } from '../../utils/api';
import AssetForm from './AssetForm';
import DepreciationRun from './DepreciationRun';
import DocumentNumberManagementPage from './DocumentNumberManagementPage';

type Tab = 'assets' | 'categories' | 'depreciation' | 'document_numbers' | 'reports';

const FUNDING_SOURCE_LABELS: Record<FundingSource, string> = {
  dana_bos: 'Dana BOS',
  dana_komite: 'Dana Komite',
  hibah: 'Hibah',
  apbd: 'APBD',
  yayasan: 'Yayasan',
  lainnya: 'Lainnya'
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api');
const ASSET_REPORTS_ENDPOINT = `${API_BASE_URL}/assets/reports.php`;

const REPORT_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard Kondisi & Nilai' },
  { id: 'fixed_asset_register', label: 'Daftar Aset Tetap' },
  { id: 'depreciation_per_period', label: 'Penyusutan Per Periode' },
  { id: 'asset_mutations', label: 'Mutasi Aset' },
  { id: 'replacement_projection', label: 'Proyeksi Penggantian' },
  { id: 'fully_depreciated_in_use', label: 'Habis Masa Pakai Masih Digunakan' },
  { id: 'disposal_summary', label: 'Pelepasan Aset' }
] as const;

type AssetReportType = typeof REPORT_OPTIONS[number]['id'];
type ReportPayload = Record<string, unknown> & { status?: string; report?: string; message?: string };
type ReportRow = Record<string, unknown>;
type ReportColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (row: ReportRow) => string;
};

const formatCurrency = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number.isFinite(numeric) ? numeric : 0);
};

const formatDate = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatNumber = (value: unknown) => new Intl.NumberFormat('id-ID').format(Number(value ?? 0) || 0);

const statusLabel = (value: unknown) => ({
  active: 'Aktif',
  inactive: 'Tidak Aktif',
  fully_depreciated: 'Habis Masa Pakai',
  disposed: 'Dilepaskan'
}[String(value)] ?? String(value ?? '-'));

const conditionLabel = (value: unknown) => ({
  new: 'Baru',
  good: 'Baik',
  fair: 'Cukup',
  damaged: 'Rusak'
}[String(value)] ?? String(value ?? '-'));

const disposalMethodLabel = (value: unknown) => ({
  sold: 'Dijual',
  written_off: 'Dihapus dari Catatan',
  traded_in: 'Tukar Tambah',
  donated: 'Dihibahkan',
  stolen_lost: 'Hilang / Dicuri'
}[String(value)] ?? String(value ?? '-'));

export default function AssetAccountingPage() {
  const {
    categories,
    assets,
    fetchCategories,
    fetchAssets,
    markAssetInactive,
    reactivateAsset,
    disposeAsset,
    loading,
    error
  } = useAssetAccounting();
  const { user } = useAuth();
  const { canEditFeature, getAccess } = useAccessMatrix();
  const [activeTab, setActiveTab] = useState<Tab>('assets');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [fundingSourceFilter, setFundingSourceFilter] = useState<string>('');
  const [actionAsset, setActionAsset] = useState<Asset | null>(null);
  const [actionType, setActionType] = useState<'inactive' | 'reactivate' | 'dispose' | null>(null);

  const accessLevel = user ? getAccess('asset_accounting', user.role) : 'none';
  const canEdit = user ? canEditFeature('asset_accounting', user.role) : false;
  const isViewOnly = accessLevel === 'view';

  useEffect(() => {
    fetchCategories();
    fetchAssets();
  }, [fetchCategories, fetchAssets]);

  const filteredAssets = assets.filter(a => {
    if (searchTerm && !a.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !a.asset_number.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (statusFilter && a.status !== statusFilter) return false;
    if (categoryFilter && a.asset_category_id !== parseInt(categoryFilter)) return false;
    if (fundingSourceFilter && a.funding_source !== fundingSourceFilter) return false;
    return true;
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'assets', label: 'Daftar Aset' },
    { id: 'categories', label: 'Kategori' },
    { id: 'depreciation', label: 'Penyusutan' },
    { id: 'document_numbers', label: 'Nomor Dokumen' },
    { id: 'reports', label: 'Laporan' }
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Akuntansi Aset Tetap</h1>
        {canEdit && activeTab === 'assets' && (
          <button
            onClick={() => { setEditingAsset(null); setShowAssetForm(true); }}
            className="px-4 py-2 bg-[#000080] text-white rounded-lg hover:bg-[#000060] transition-colors"
          >
            + Tambah Aset Baru
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[#000080] border-b-2 border-[#000080]'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isViewOnly && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
          Mode akses: <span className="font-semibold">View</span>. Anda dapat melihat data dan laporan, tetapi tidak dapat menambah atau mengubah aset.
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'assets' && (
        <AssetsTab
          assets={filteredAssets}
          categories={categories}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          fundingSourceFilter={fundingSourceFilter}
          setFundingSourceFilter={setFundingSourceFilter}
          onEdit={(asset) => { setEditingAsset(asset); setShowAssetForm(true); }}
          onAction={(asset, type) => { setActionAsset(asset); setActionType(type); }}
          canEdit={canEdit}
          loading={loading}
        />
      )}

      {activeTab === 'categories' && (
        <CategoriesTab categories={categories} loading={loading} />
      )}

      {activeTab === 'depreciation' && (
        <DepreciationRun />
      )}

      {activeTab === 'document_numbers' && (
        <DocumentNumberManagementPage />
      )}

      {activeTab === 'reports' && (
        <ReportsTab />
      )}

      {/* Asset Form Modal */}
      {showAssetForm && (
        <AssetForm
          asset={editingAsset}
          categories={categories}
          onClose={() => { setShowAssetForm(false); setEditingAsset(null); }}
          onSuccess={() => { setShowAssetForm(false); setEditingAsset(null); fetchAssets(); }}
        />
      )}

      {actionAsset && actionType && (
        <AssetActionModal
          asset={actionAsset}
          actionType={actionType}
          onClose={() => { setActionAsset(null); setActionType(null); }}
          onMarkInactive={markAssetInactive}
          onReactivate={reactivateAsset}
          onDispose={disposeAsset}
        />
      )}
    </div>
  );
}

function AssetsTab({
  assets, categories, searchTerm, setSearchTerm,
  statusFilter, setStatusFilter, categoryFilter, setCategoryFilter,
  fundingSourceFilter, setFundingSourceFilter,
  onEdit, onAction, canEdit, loading
}: {
  assets: Asset[]; categories: AssetCategory[];
  searchTerm: string; setSearchTerm: (s: string) => void;
  statusFilter: string; setStatusFilter: (s: string) => void;
  categoryFilter: string; setCategoryFilter: (s: string) => void;
  fundingSourceFilter: string; setFundingSourceFilter: (s: string) => void;
  onEdit: (asset: Asset) => void;
  onAction: (asset: Asset, type: 'inactive' | 'reactivate' | 'dispose') => void;
  canEdit: boolean;
  loading: boolean;
}) {
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-emerald-100 text-emerald-700',
      inactive: 'bg-orange-100 text-orange-700',
      fully_depreciated: 'bg-amber-100 text-amber-700',
      disposed: 'bg-slate-100 text-slate-600'
    };
    const labels: Record<string, string> = {
      active: 'Aktif',
      inactive: 'Tidak Aktif',
      fully_depreciated: 'Habis Masa Pakai',
      disposed: 'Dilepaskan'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-slate-100 text-slate-700'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Cari nama atau nomor aset..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20 focus:border-[#000080]"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
        >
          <option value="">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="inactive">Tidak Aktif</option>
          <option value="fully_depreciated">Habis Masa Pakai</option>
          <option value="disposed">Dilepaskan</option>
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
        >
          <option value="">Semua Kategori</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={fundingSourceFilter}
          onChange={e => setFundingSourceFilter(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
        >
          <option value="">Semua Sumber Dana</option>
          {Object.entries(FUNDING_SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Memuat...</div>
        ) : assets.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Belum ada aset. Tambahkan aset baru untuk memulai.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">No. Aset</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Nama Aset</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Kategori</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Sumber Dana</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">Harga Perolehan</th>
                <th className="text-right px-4 py-3 text-sm font-semibold text-slate-600">Nilai Buku</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map(asset => (
                <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-sm">{asset.asset_number}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{asset.name}</div>
                    <div className="text-xs text-slate-500">{asset.location_name || '-'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{asset.category_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{FUNDING_SOURCE_LABELS[asset.funding_source] || '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(asset.acquisition_cost)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatCurrency(asset.current_book_value || 0)}</td>
                  <td className="px-4 py-3">{getStatusBadge(asset.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => onEdit(asset)}
                        className="text-[#000080] hover:underline text-sm"
                      >
                        Detail
                      </button>
                      {canEdit && asset.status !== 'disposed' && asset.status !== 'inactive' && (
                        <button
                          onClick={() => onAction(asset, 'inactive')}
                          className="text-orange-700 hover:underline text-sm"
                        >
                          Nonaktifkan
                        </button>
                      )}
                      {canEdit && asset.status === 'inactive' && (
                        <button
                          onClick={() => onAction(asset, 'reactivate')}
                          className="text-emerald-700 hover:underline text-sm"
                        >
                          Aktifkan
                        </button>
                      )}
                      {canEdit && (asset.status === 'inactive' || asset.status === 'fully_depreciated') && (
                        <button
                          onClick={() => onAction(asset, 'dispose')}
                          className="text-red-700 hover:underline text-sm"
                        >
                          Lepaskan
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AssetActionModal({
  asset,
  actionType,
  onClose,
  onMarkInactive,
  onReactivate,
  onDispose
}: {
  asset: Asset;
  actionType: 'inactive' | 'reactivate' | 'dispose';
  onClose: () => void;
  onMarkInactive: (id: number, data: { inactive_date: string; inactive_reason: string; condition?: string }) => Promise<void>;
  onReactivate: (id: number, reason: string) => Promise<void>;
  onDispose: (id: number, data: {
    disposal_date: string;
    disposal_method: string;
    disposal_reason: string;
    proceeds: number;
    document_reference?: string;
  }) => Promise<any>;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');
  const [condition, setCondition] = useState('damaged');
  const [method, setMethod] = useState('written_off');
  const [proceeds, setProceeds] = useState('0');
  const [documentReference, setDocumentReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsDocument = ['dana_bos', 'hibah', 'apbd'].includes(asset.funding_source);

  const title = actionType === 'inactive'
    ? 'Tandai Aset Tidak Aktif'
    : actionType === 'reactivate'
      ? 'Aktifkan Kembali Aset'
      : 'Lepaskan Aset';

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (actionType === 'inactive') {
        await onMarkInactive(asset.id, {
          inactive_date: date,
          inactive_reason: reason.trim(),
          condition
        });
      } else if (actionType === 'reactivate') {
        await onReactivate(asset.id, reason.trim());
      } else {
        await onDispose(asset.id, {
          disposal_date: date,
          disposal_method: method,
          disposal_reason: reason.trim(),
          proceeds: parseFloat(proceeds.replace(/[^\d.]/g, '')) || 0,
          document_reference: documentReference.trim()
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aksi gagal diproses.');
    } finally {
      setSubmitting(false);
    }
  };

  const reasonLabel = actionType === 'reactivate'
    ? 'Alasan diaktifkan kembali'
    : actionType === 'dispose'
      ? 'Alasan pelepasan'
      : 'Alasan tidak aktif';

  const isDisposalDateInvalid = actionType === 'dispose' && date < today;
  const isSubmitDisabled = submitting
    || !reason.trim()
    || isDisposalDateInvalid
    || (actionType === 'dispose' && needsDocument && !documentReference.trim());

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
            <p className="text-sm text-slate-500">{asset.asset_number} - {asset.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">x</button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          {actionType !== 'reactivate' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {actionType === 'dispose' ? 'Tanggal Pelepasan' : 'Tanggal Tidak Aktif'}
              </label>
              <input
                type="date"
                value={date}
                min={actionType === 'dispose' ? today : undefined}
                max={actionType === 'dispose' ? undefined : today}
                onChange={e => setDate(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
              />
              {isDisposalDateInvalid && (
                <p className="mt-1 text-xs text-red-600">Tanggal pelepasan tidak boleh sebelum hari ini.</p>
              )}
            </div>
          )}

          {actionType === 'inactive' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kondisi Saat Ini</label>
              <select
                value={condition}
                onChange={e => setCondition(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
              >
                <option value="fair">Rusak Ringan / Cukup</option>
                <option value="damaged">Rusak Berat</option>
                <option value="good">Masih Baik, Tidak Dipakai</option>
              </select>
            </div>
          )}

          {actionType === 'dispose' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Metode Pelepasan</label>
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                >
                  <option value="written_off">Dihapus dari Catatan</option>
                  <option value="sold">Dijual</option>
                  <option value="donated">Dihibahkan</option>
                  <option value="traded_in">Ditukar Tambah</option>
                  <option value="stolen_lost">Hilang / Dicuri</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nilai Jual / Penggantian (Rp)</label>
                <input
                  type="text"
                  value={proceeds}
                  onChange={e => setProceeds(e.target.value.replace(/[^\d]/g, ''))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  No. Berita Acara / Surat {needsDocument ? '*' : ''}
                </label>
                <input
                  type="text"
                  value={documentReference}
                  onChange={e => setDocumentReference(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                />
                {needsDocument && (
                  <p className="mt-1 text-xs text-amber-700">
                    Wajib untuk sumber dana {FUNDING_SOURCE_LABELS[asset.funding_source]}.
                  </p>
                )}
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{reasonLabel} *</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:text-slate-800">Batal</button>
          <button
            onClick={submit}
            disabled={isSubmitDisabled}
            className="px-5 py-2 bg-[#000080] text-white rounded-lg hover:bg-[#000060] disabled:opacity-50"
          >
            {submitting ? 'Memproses...' : 'Konfirmasi'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoriesTab({ categories, loading }: { categories: AssetCategory[]; loading: boolean }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {loading ? (
        <div className="col-span-full p-8 text-center text-slate-500">Memuat...</div>
      ) : categories.length === 0 ? (
        <div className="col-span-full p-8 text-center text-slate-500">Belum ada kategori.</div>
      ) : categories.map(cat => (
        <div key={cat.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 mb-2">{cat.name}</h3>
          <div className="space-y-1 text-sm text-slate-600">
            <div>Metode: <span className="font-medium capitalize">{cat.default_depreciation_method.replace('_', ' ')}</span></div>
            <div>Masa Manfaat: <span className="font-medium">{cat.default_useful_life_months} bulan</span></div>
            <div>Threshold: <span className="font-medium">{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(cat.capitalization_threshold)}</span></div>
            <div>Depreciable: <span className="font-medium">{cat.is_depreciable ? 'Ya' : 'Tidak'}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsTab() {
  const { user } = useAuth();
  const { canSee } = useAccessMatrix();
  const canViewReports = user ? canSee('asset_accounting', user.role) : false;
  const today = new Date().toISOString().split('T')[0];
  const currentYear = String(new Date().getFullYear());
  const currentMonth = String(new Date().getMonth() + 1);
  const [reportType, setReportType] = useState<AssetReportType>('fixed_asset_register');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asOfDate, setAsOfDate] = useState(today);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [startYear, setStartYear] = useState(currentYear);
  const [endYear, setEndYear] = useState(currentYear);
  const [monthsAhead, setMonthsAhead] = useState('12');
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(today);

  const reportTitle = REPORT_OPTIONS.find(option => option.id === reportType)?.label ?? 'Laporan Aset';

  const generateReport = async () => {
    if (!canViewReports) {
      setError('Anda tidak memiliki akses untuk membuat laporan aset.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type: reportType });
      if (reportType === 'fixed_asset_register') params.set('as_of_date', asOfDate);
      if (reportType === 'depreciation_per_period') {
        params.set('year', year);
        params.set('month', month);
      }
      if (reportType === 'asset_mutations') {
        params.set('start_year', startYear);
        params.set('end_year', endYear);
      }
      if (reportType === 'replacement_projection') params.set('months', monthsAhead);
      if (reportType === 'disposal_summary') {
        params.set('start_date', startDate);
        params.set('end_date', endDate);
      }

      const response = await fetch(`${ASSET_REPORTS_ENDPOINT}?${params.toString()}`, {
        headers: getAuthHeaders()
      });
      const data = await response.json() as ReportPayload;
      if (response.ok && data.status === 'success') {
        setReportData(data);
      } else {
        throw new Error(data.message || 'Gagal membuat laporan.');
      }
    } catch (err) {
      console.error('Failed to generate report:', err);
      setError(err instanceof Error ? err.message : 'Gagal membuat laporan.');
    } finally {
      setLoading(false);
    }
  };

  const renderParameters = () => {
    if (reportType === 'fixed_asset_register') {
      return (
        <ReportField label="Tanggal Laporan">
          <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
        </ReportField>
      );
    }
    if (reportType === 'depreciation_per_period') {
      return (
        <>
          <ReportField label="Tahun">
            <input type="number" value={year} onChange={e => setYear(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </ReportField>
          <ReportField label="Bulan">
            <select value={month} onChange={e => setMonth(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index + 1} value={String(index + 1)}>
                  {new Date(2026, index, 1).toLocaleDateString('id-ID', { month: 'long' })}
                </option>
              ))}
            </select>
          </ReportField>
        </>
      );
    }
    if (reportType === 'asset_mutations') {
      return (
        <>
          <ReportField label="Tahun Awal">
            <input type="number" value={startYear} onChange={e => setStartYear(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </ReportField>
          <ReportField label="Tahun Akhir">
            <input type="number" value={endYear} onChange={e => setEndYear(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </ReportField>
        </>
      );
    }
    if (reportType === 'replacement_projection') {
      return (
        <ReportField label="Horizon Proyeksi">
          <select value={monthsAhead} onChange={e => setMonthsAhead(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg">
            <option value="6">6 bulan</option>
            <option value="12">12 bulan</option>
            <option value="24">24 bulan</option>
            <option value="36">36 bulan</option>
            <option value="60">60 bulan</option>
          </select>
        </ReportField>
      );
    }
    if (reportType === 'disposal_summary') {
      return (
        <>
          <ReportField label="Tanggal Awal">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </ReportField>
          <ReportField label="Tanggal Akhir">
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </ReportField>
        </>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <ReportField label="Jenis Laporan">
            <select
              value={reportType}
              onChange={e => {
                setReportType(e.target.value as AssetReportType);
                setReportData(null);
                setError(null);
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              {REPORT_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </ReportField>
          {renderParameters()}
          <button
            onClick={generateReport}
            className="px-4 py-2 bg-[#000080] text-white rounded-lg hover:bg-[#000060] disabled:opacity-50"
            disabled={loading || !canViewReports}
          >
            {loading ? 'Memuat...' : 'Generate Laporan'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {reportData && (
        <ReportDocument title={reportTitle} reportData={reportData}>
          {renderReportBody(reportType, reportData)}
        </ReportDocument>
      )}
    </div>
  );
}

function ReportField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function ReportDocument({ title, reportData, children }: { title: string; reportData: ReportPayload; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 bg-slate-50">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Laporan Akuntansi Aset Tetap</p>
            <h2 className="text-xl font-bold text-slate-900 mt-1">{title}</h2>
          </div>
          <div className="text-sm text-slate-600 md:text-right">
            <div>Dibuat: {new Date().toLocaleString('id-ID')}</div>
            {'period' in reportData && <div>Periode: {String(reportData.period)}</div>}
            {'as_of_date' in reportData && <div>Per tanggal: {formatDate(reportData.as_of_date)}</div>}
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">{children}</div>
      <div className="px-6 py-4 border-t border-slate-200 text-xs text-slate-500 flex justify-between">
        <span>Disiapkan oleh: Admin Akuntansi Aset</span>
        <span>Halaman 1</span>
      </div>
    </div>
  );
}

function SummaryGrid({ items }: { items: { label: string; value: string; tone?: string }[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      {items.map(item => (
        <div key={item.label} className={`border rounded-lg p-4 ${item.tone ?? 'bg-white border-slate-200'}`}>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
          <p className="mt-2 text-lg font-bold text-slate-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ columns, rows, emptyText }: { columns: ReportColumn[]; rows: ReportRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <div className="p-6 text-center text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg">{emptyText}</div>;
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-slate-600">
          <tr>
            {columns.map(column => (
              <th key={column.key} className={`px-3 py-2 font-bold ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, rowIndex) => (
            <tr key={String(row.id ?? row.asset_number ?? row.category_id ?? rowIndex)} className="hover:bg-slate-50">
              {columns.map(column => (
                <td key={column.key} className={`px-3 py-2 ${column.align === 'right' ? 'text-right font-mono' : column.align === 'center' ? 'text-center' : 'text-left'}`}>
                  {column.render ? column.render(row) : String(row[column.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderReportBody(reportType: AssetReportType, reportData: ReportPayload) {
  if (reportType === 'dashboard') {
    const summary = (reportData.summary ?? {}) as ReportRow;
    const byStatus = Array.isArray(reportData.by_status) ? reportData.by_status as ReportRow[] : [];
    const byCondition = Array.isArray(reportData.by_condition) ? reportData.by_condition as ReportRow[] : [];
    return (
      <>
        <SummaryGrid items={[
          { label: 'Jumlah Aset', value: formatNumber(summary.asset_count) },
          { label: 'Harga Perolehan', value: formatCurrency(summary.total_acquisition_cost) },
          { label: 'Akumulasi Penyusutan', value: formatCurrency(summary.total_accumulated_depreciation) },
          { label: 'Nilai Buku Bersih', value: formatCurrency(summary.net_book_value), tone: 'bg-blue-50 border-blue-200' }
        ]} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ReportTable
            emptyText="Belum ada data status aset."
            columns={[
              { key: 'status', label: 'Status', render: row => statusLabel(row.status) },
              { key: 'count', label: 'Jumlah', align: 'right', render: row => formatNumber(row.count) }
            ]}
            rows={byStatus}
          />
          <ReportTable
            emptyText="Belum ada data kondisi aset."
            columns={[
              { key: 'condition', label: 'Kondisi', render: row => conditionLabel(row.condition) },
              { key: 'count', label: 'Jumlah', align: 'right', render: row => formatNumber(row.count) }
            ]}
            rows={byCondition}
          />
        </div>
      </>
    );
  }

  if (reportType === 'fixed_asset_register') {
    const categories = (typeof reportData.categories === 'object' && reportData.categories !== null ? reportData.categories : {}) as Record<string, { assets?: ReportRow[]; totals?: ReportRow }>;
    const grandTotal = (reportData.grand_total ?? {}) as ReportRow;
    return (
      <>
        <SummaryGrid items={[
          { label: 'Total Perolehan', value: formatCurrency(grandTotal.acquisition_cost) },
          { label: 'Akumulasi Penyusutan', value: formatCurrency(grandTotal.accumulated_depreciation) },
          { label: 'Nilai Buku', value: formatCurrency(grandTotal.current_book_value), tone: 'bg-blue-50 border-blue-200' }
        ]} />
        {Object.entries(categories).map(([categoryName, group]) => (
          <section key={categoryName} className="space-y-3">
            <div className="flex justify-between items-end">
              <h3 className="font-bold text-slate-800">{categoryName}</h3>
              <p className="text-sm text-slate-500">Subtotal nilai buku: {formatCurrency(group.totals?.current_book_value)}</p>
            </div>
            <ReportTable
              emptyText="Tidak ada aset pada kategori ini."
              columns={[
                { key: 'asset_number', label: 'No. Aset' },
                { key: 'asset_name', label: 'Nama Aset' },
                { key: 'acquisition_date', label: 'Tgl Perolehan', render: row => formatDate(row.acquisition_date) },
                { key: 'location_name', label: 'Lokasi' },
                { key: 'funding_source', label: 'Sumber Dana', render: row => FUNDING_SOURCE_LABELS[String(row.funding_source) as FundingSource] ?? '-' },
                { key: 'acquisition_cost', label: 'Perolehan', align: 'right', render: row => formatCurrency(row.acquisition_cost) },
                { key: 'accumulated_depreciation', label: 'Akum. Penyusutan', align: 'right', render: row => formatCurrency(row.accumulated_depreciation) },
                { key: 'current_book_value', label: 'Nilai Buku', align: 'right', render: row => formatCurrency(row.current_book_value) }
              ]}
              rows={group.assets ?? []}
            />
          </section>
        ))}
      </>
    );
  }

  if (reportType === 'depreciation_per_period') {
    const assets = Array.isArray(reportData.assets) ? reportData.assets as ReportRow[] : [];
    const totals = (reportData.totals ?? {}) as ReportRow;
    return (
      <>
        <SummaryGrid items={[
          { label: 'Saldo Awal Akumulasi', value: formatCurrency(totals.accumulated_start) },
          { label: 'Beban Periode Ini', value: formatCurrency(totals.current_period_depreciation), tone: 'bg-blue-50 border-blue-200' },
          { label: 'Saldo Akhir Akumulasi', value: formatCurrency(totals.accumulated_end) }
        ]} />
        <ReportTable
          emptyText="Belum ada penyusutan terposting untuk periode ini."
          columns={[
            { key: 'asset_number', label: 'No. Aset' },
            { key: 'asset_name', label: 'Nama Aset' },
            { key: 'category_name', label: 'Kategori' },
            { key: 'current_period_dep', label: 'Penyusutan', align: 'right', render: row => formatCurrency(row.current_period_dep) },
            { key: 'accumulated_end', label: 'Akum. Akhir', align: 'right', render: row => formatCurrency(row.accumulated_end) },
            { key: 'book_value_end', label: 'Nilai Buku Akhir', align: 'right', render: row => formatCurrency(row.book_value_end) },
            { key: 'journal_number', label: 'No. Jurnal' }
          ]}
          rows={assets}
        />
      </>
    );
  }

  if (reportType === 'asset_mutations') {
    const categories = Array.isArray(reportData.categories) ? reportData.categories as ReportRow[] : [];
    const grandTotal = (reportData.grand_total ?? {}) as ReportRow;
    return (
      <>
        <SummaryGrid items={[
          { label: 'Saldo Awal', value: formatCurrency(grandTotal.opening) },
          { label: 'Penambahan', value: formatCurrency(grandTotal.acquisitions), tone: 'bg-emerald-50 border-emerald-200' },
          { label: 'Pengurangan', value: formatCurrency(grandTotal.disposals) },
          { label: 'Saldo Akhir', value: formatCurrency(grandTotal.closing), tone: 'bg-blue-50 border-blue-200' }
        ]} />
        <ReportTable
          emptyText="Belum ada mutasi aset pada periode ini."
          columns={[
            { key: 'category_name', label: 'Kategori' },
            { key: 'opening', label: 'Saldo Awal', align: 'right', render: row => formatCurrency(row.opening) },
            { key: 'acquisitions', label: 'Penambahan', align: 'right', render: row => formatCurrency(row.acquisitions) },
            { key: 'disposals', label: 'Pelepasan', align: 'right', render: row => formatCurrency(row.disposals) },
            { key: 'depreciation', label: 'Penyusutan', align: 'right', render: row => formatCurrency(row.depreciation) },
            { key: 'closing', label: 'Saldo Akhir', align: 'right', render: row => formatCurrency(row.closing) }
          ]}
          rows={categories}
        />
      </>
    );
  }

  if (reportType === 'replacement_projection') {
    const assets = Array.isArray(reportData.assets) ? reportData.assets as ReportRow[] : [];
    return (
      <ReportTable
        emptyText="Tidak ada aset yang jatuh tempo penggantian pada horizon ini."
        columns={[
          { key: 'asset_number', label: 'No. Aset' },
          { key: 'asset_name', label: 'Nama Aset' },
          { key: 'category_name', label: 'Kategori' },
          { key: 'location_name', label: 'Lokasi' },
          { key: 'useful_life_end_date', label: 'Akhir Masa Manfaat', render: row => formatDate(row.useful_life_end_date) },
          { key: 'acquisition_cost', label: 'Estimasi Nilai Dasar', align: 'right', render: row => formatCurrency(row.acquisition_cost) },
          { key: 'funding_source', label: 'Sumber Dana', render: row => FUNDING_SOURCE_LABELS[String(row.funding_source) as FundingSource] ?? '-' }
        ]}
        rows={assets}
      />
    );
  }

  if (reportType === 'fully_depreciated_in_use') {
    const assets = Array.isArray(reportData.assets) ? reportData.assets as ReportRow[] : [];
    return (
      <ReportTable
        emptyText="Tidak ada aset habis masa pakai yang masih digunakan."
        columns={[
          { key: 'asset_number', label: 'No. Aset' },
          { key: 'asset_name', label: 'Nama Aset' },
          { key: 'category_name', label: 'Kategori' },
          { key: 'location_name', label: 'Lokasi' },
          { key: 'fully_depreciated_date', label: 'Tanggal Habis Manfaat', render: row => formatDate(row.fully_depreciated_date) },
          { key: 'condition', label: 'Kondisi', render: row => conditionLabel(row.condition) },
          { key: 'acquisition_cost', label: 'Nilai Perolehan', align: 'right', render: row => formatCurrency(row.acquisition_cost) }
        ]}
        rows={assets}
      />
    );
  }

  const assets = Array.isArray(reportData.assets) ? reportData.assets as ReportRow[] : [];
  return (
    <ReportTable
      emptyText="Tidak ada pelepasan aset pada periode ini."
      columns={[
        { key: 'asset_number', label: 'No. Aset' },
        { key: 'asset_name', label: 'Nama Aset' },
        { key: 'category_name', label: 'Kategori' },
        { key: 'disposal_date', label: 'Tanggal', render: row => formatDate(row.disposal_date) },
        { key: 'disposal_method', label: 'Metode', render: row => disposalMethodLabel(row.disposal_method) },
        { key: 'book_value_at_disposal', label: 'Nilai Buku', align: 'right', render: row => formatCurrency(row.book_value_at_disposal) },
        { key: 'proceeds', label: 'Hasil', align: 'right', render: row => formatCurrency(row.proceeds) },
        { key: 'surplus_deficit', label: 'Surplus/Defisit', align: 'right', render: row => formatCurrency(row.surplus_deficit) },
        { key: 'document_reference', label: 'Dokumen' }
      ]}
      rows={assets}
    />
  );
}


