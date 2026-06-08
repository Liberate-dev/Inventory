import { useState } from 'react';
import { useAssetAccounting } from '../../context/AssetAccountingContext';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DepreciationRun() {
  const { previewDepreciation, postDepreciation, depreciationPreview, loading, error } = useAssetAccounting();
  const { user } = useAuth();
  const { canEditFeature } = useAccessMatrix();
  const [step, setStep] = useState(1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [posting, setPosting] = useState(false);
  const [postedResult, setPostedResult] = useState<any>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});
  const canPost = user ? canEditFeature('asset_accounting', user.role) : false;
  const canSeeJournals = canPost;

  const handlePreview = async () => {
    await previewDepreciation(selectedYear, selectedMonth);
    setStep(2);
  };

  const handlePost = async () => {
    setPosting(true);
    try {
      const selectedIds = depreciationPreview?.items
        .filter(item => isItemSelected(item.asset_id, item.is_included))
        .map(item => String(item.asset_id)) || [];
      const result = await postDepreciation(selectedYear, selectedMonth, selectedIds);
      setPostedResult(result);
      setStep(3);
    } catch (err) {
      console.error('Failed to post:', err);
    } finally {
      setPosting(false);
    }
  };

  const resetAndStart = () => {
    setStep(1);
    setPostedResult(null);
    setSelectedItems({});
  };

  const toggleItem = (assetId: string) => {
    setSelectedItems(prev => ({ ...prev, [assetId]: !prev[assetId] }));
  };

  const toggleAll = (allIncluded: boolean) => {
    if (depreciationPreview) {
      const newSelected: Record<string, boolean> = {};
      depreciationPreview.items.forEach(item => {
        newSelected[String(item.asset_id)] = allIncluded && item.is_included;
      });
      setSelectedItems(newSelected);
    }
  };

  const isItemSelected = (assetId: number, defaultIncluded: boolean) => {
    const key = String(assetId);
    return selectedItems[key] ?? defaultIncluded;
  };

  const getSelectedCount = () => {
    if (!depreciationPreview) return 0;
    return depreciationPreview.items.filter(item => isItemSelected(item.asset_id, item.is_included)).length;
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

  const periodLabel = `${months[selectedMonth - 1]} ${selectedYear}`;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      )}

      {/* Step Indicator */}
      <div className="flex items-center gap-4">
        {[1, 2, 3].map(s => (
          <div key={s} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s ? 'bg-[#000080] text-white' : 'bg-slate-200 text-slate-500'
            }`}>
              {s}
            </div>
            <span className={`ml-2 text-sm ${step >= s ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
              {s === 1 ? 'Pilih Periode' : s === 2 ? 'Preview' : 'Selesai'}
            </span>
            {s < 3 && <div className="w-16 h-0.5 mx-4 bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Period Selection */}
      {step === 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Pilih Periode Penyusutan</h3>
          <div className="flex gap-4 items-center">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Bulan</label>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(parseInt(e.target.value))}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
              >
                {months.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Tahun</label>
              <input
                type="number"
                value={selectedYear}
                onChange={e => setSelectedYear(parseInt(e.target.value))}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
              />
            </div>
            <button
              onClick={handlePreview}
              disabled={loading}
              className="mt-6 px-6 py-2 bg-[#000080] text-white rounded-lg hover:bg-[#000060] disabled:opacity-50"
            >
              {loading ? 'Memuat...' : 'Preview'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 2 && depreciationPreview && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Preview Penyusutan {periodLabel}</h3>
              <button
                onClick={() => setStep(1)}
                className="text-slate-600 hover:text-slate-800"
              >
                Ganti Periode
              </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="text-sm text-slate-500">Total Aset</div>
                <div className="text-xl font-bold text-slate-800">{depreciationPreview.summary.total_assets}</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4">
                <div className="text-sm text-emerald-600">Disusutkan</div>
                <div className="text-xl font-bold text-emerald-700">{depreciationPreview.summary.included_assets}</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="text-sm text-amber-600">Tidak Disusutkan</div>
                <div className="text-xl font-bold text-amber-700">{depreciationPreview.summary.excluded_assets}</div>
              </div>
              <div className="bg-[#000080]/5 rounded-lg p-4">
                <div className="text-sm text-[#000080]">Total Penyusutan</div>
                <div className="text-xl font-bold text-[#000080]">{formatCurrency(depreciationPreview.summary.total_depreciation)}</div>
              </div>
            </div>

            {/* Asset List */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={depreciationPreview.items.length > 0 && depreciationPreview.items.every(i => isItemSelected(i.asset_id, i.is_included))}
                          onChange={e => toggleAll(e.target.checked)}
                          className="w-4 h-4 accent-[#000080] cursor-pointer"
                        />
                      </div>
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">No. Aset</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Nama Aset</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Nilai Buku Awal</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Penyusutan</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Nilai Buku Akhir</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {depreciationPreview.items.map(item => {
                    const isSelected = isItemSelected(item.asset_id, item.is_included);
                    return (
                    <tr key={item.asset_id} className={!isSelected ? 'opacity-60' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!item.is_included}
                            onChange={() => toggleItem(String(item.asset_id))}
                            className="w-4 h-4 accent-[#000080] cursor-pointer"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">{item.asset_number}</td>
                      <td className="px-4 py-3">{item.asset_name}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(item.opening_book_value)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(item.scheduled_depreciation)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatCurrency(item.closing_book_value)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          isSelected
                            ? item.is_prorata
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {isSelected ? (item.is_prorata ? 'Pro-rata' : 'Normal') : item.status_note}
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Selection Summary */}
            <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={depreciationPreview.items.length > 0 && depreciationPreview.items.every(i => isItemSelected(i.asset_id, i.is_included))}
                  onChange={e => toggleAll(e.target.checked)}
                  className="w-4 h-4 accent-[#000080] cursor-pointer"
                />
                <span className="text-sm text-slate-600">
                  Dipilih: <span className="font-semibold text-slate-800">{getSelectedCount()}</span> dari {depreciationPreview.items.length} aset
                </span>
              </div>
              <button
                onClick={() => toggleAll(false)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Hapus Semua
              </button>
            </div>

            {/* Journal Preview */}
            {canSeeJournals && depreciationPreview.journal_preview && depreciationPreview.journal_preview.length > 0 && (
              <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                <h4 className="font-medium text-slate-700 mb-3">Preview Jurnal</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="text-left">Akun</th>
                      <th className="text-right">Debit</th>
                      <th className="text-right">Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depreciationPreview.journal_preview.map((line, i) => (
                      <tr key={i}>
                        <td className="py-1">{line.expense_account} - Beban Penyusutan {line.category}</td>
                        <td className="text-right font-mono">{formatCurrency(line.amount)}</td>
                        <td className="text-right font-mono">-</td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-300">
                      <td className="pt-2 font-medium">Akun Penyusutan Ditambahkan</td>
                      <td className="pt-2 text-right font-mono">-</td>
                      <td className="pt-2 text-right font-mono">{formatCurrency(depreciationPreview.summary.total_depreciation)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Action */}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800"
              >
                Batal
              </button>
              <button
                onClick={handlePost}
                disabled={!canPost || posting || getSelectedCount() === 0}
                className="px-6 py-2 bg-[#000080] text-white rounded-lg hover:bg-[#000060] disabled:opacity-50"
              >
                {!canPost ? 'Tidak Ada Akses Posting' : posting ? 'Memposting...' : `Posting Penyusutan (${getSelectedCount()} aset)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Success */}
      {step === 3 && postedResult && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-800 mb-2">Penyusutan Berhasil Diposting!</h3>
            <p className="text-slate-600 mb-4">
              {periodLabel} - {postedResult.total_assets_processed} aset diproses, total {formatCurrency(postedResult.total_depreciation_amount)}
            </p>
            {canSeeJournals && postedResult.journal_number && (
              <p className="text-sm text-slate-500 mb-6">
                Jurnal: <span className="font-mono">{postedResult.journal_number}</span>
              </p>
            )}
            <button
              onClick={resetAndStart}
              className="px-6 py-2 bg-[#000080] text-white rounded-lg hover:bg-[#000060]"
            >
              Jalankan Periode Lain
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
