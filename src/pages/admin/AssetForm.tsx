import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';
import type { Asset, AssetCategory, FundingSource } from '../../context/AssetAccountingContext';
import { getDefaultDepreciationStartDate } from '../../utils/assetDocumentNumber';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api');
const DOCUMENT_NUMBERS_ENDPOINT = `${API_BASE_URL}/assets/document_numbers.php`;

const FUNDING_SOURCE_LABELS: Record<string, string> = {
  dana_bos: 'Dana BOS',
  dana_komite: 'Dana Komite',
  hibah: 'Hibah',
  apbd: 'APBD',
  yayasan: 'Yayasan',
  lainnya: 'Lainnya'
};

interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  condition: string;
  specs: string | null;
  parameters: string | null;
  room_name: string;
  room_id: number;
  room_type: string;
  container_name: string;
  container_id: number;
  acquisition_date: string | null;
  acquisition_cost: number | null;
}

interface User {
  id: number;
  name: string;
  role: string;
  lab_scope: string;
}

interface AssetFormProps {
  asset?: Asset | null;
  categories: AssetCategory[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function AssetForm({ asset, categories, onClose, onSuccess }: AssetFormProps) {
  const { user } = useAuth();
  const { canEditFeature, canSee } = useAccessMatrix();
  const canViewAssets = user ? canSee('asset_accounting', user.role) : false;
  const canManageAssets = user ? canEditFeature('asset_accounting', user.role) : false;
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [rooms, setRooms] = useState<{id: number, name: string}[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedItemData, setSelectedItemData] = useState<InventoryItem | null>(null);
  const isEditing = !!asset;
  const defaultAcquisitionDate = new Date().toISOString().split('T')[0];

  // Step 1 - Identity
  const [formData, setFormData] = useState({
    inventory_item_id: asset?.inventory_item_id || '',
    name: asset?.name || '',
    description: asset?.description || '',
    asset_category_id: asset?.asset_category_id || '',
    location_id: asset?.location_id || '',
    responsible_user_id: asset?.responsible_user_id || '',
    condition: asset?.condition || 'good'
  });

  // Step 2 - Financial
  const [financialData, setFinancialData] = useState({
    acquisition_date: asset?.acquisition_date || defaultAcquisitionDate,
    acquisition_cost: asset?.acquisition_cost || '',
    salvage_value: asset?.salvage_value || '0',
    depreciation_method: asset?.depreciation_method || 'straight_line',
    useful_life_months: asset?.useful_life_months || '48',
    depreciation_rate: asset?.depreciation_rate || '',
    depreciation_start_date: asset?.depreciation_start_date || getDefaultDepreciationStartDate(defaultAcquisitionDate),
    document_reference: asset?.document_reference || '',
    funding_source: asset?.funding_source || 'lainnya',
    vendor_name: asset?.vendor_name || ''
  });
  const [depreciationStartManuallyEdited, setDepreciationStartManuallyEdited] = useState(isEditing);
  const [generatedDocumentReference, setGeneratedDocumentReference] = useState('');
  const [generatedDocumentDate, setGeneratedDocumentDate] = useState('');

  // Get category defaults when category changes
  const selectedCategory = categories.find(c => c.id === parseInt(String(formData.asset_category_id)));

  // Fetch inventory items, rooms, and kepala_lab users
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/inventory/items_management.php`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.status === 'success') {
          setInventoryItems(data.items || []);
        }
      } catch (err) {
        console.error('Failed to fetch items:', err);
      }
    };

    const fetchRooms = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/inventory/rooms.php?entity=room`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.status === 'success') {
          setRooms(data.rooms || []);
        }
      } catch (err) {
        console.error('Failed to fetch rooms:', err);
      }
    };

    const fetchUsers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/users/lab_heads.php`, { headers: getAuthHeaders() });
        const data = await response.json();
        if (data.status === 'success') {
          setAllUsers(data.heads || []);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };

    fetchItems();
    fetchRooms();
    fetchUsers();
  }, []);

  // Auto-calculate salvage value based on category default
  useEffect(() => {
    if (selectedCategory && financialData.acquisition_cost && !isEditing) {
      const cost = parseFloat(String(financialData.acquisition_cost)) || 0;
      const salvagePct = selectedCategory.default_salvage_value_pct || 0;
      const calculatedSalvage = cost * (salvagePct / 100);
      setFinancialData(prev => ({
        ...prev,
        salvage_value: calculatedSalvage > 0 ? calculatedSalvage.toString() : '0'
      }));
    }
  }, [financialData.acquisition_cost, selectedCategory, isEditing]);

  // Handle item selection
  const handleSelectItem = (itemId: string) => {
    const item = inventoryItems.find(i => String(i.id) === itemId);
    setSelectedItemData(item || null);

    // Find responsible user based on room type
    let responsibleId = '';
    if (item?.room_type) {
      const labTypes = ['biology', 'chemistry', 'physics', 'computer'];
      if (labTypes.includes(item.room_type)) {
        // Lab rooms → kepala_lab with matching lab_scope
        const kepala = allUsers.find(k => k.role === 'kepala_lab' && k.lab_scope === item.room_type);
        if (kepala) {
          responsibleId = String(kepala.id);
        }
      } else {
        // Non-lab rooms → kepala_sekolah or sarpras
        const nonLab = allUsers.find(k => k.role === 'kepala_sekolah' || k.role === 'sarpras');
        if (nonLab) {
          responsibleId = String(nonLab.id);
        }
      }
    }

    // Build description from inventory item
    let itemDescription = '';
    if (item) {
      const parts = [];
      if (item.sku) parts.push(`SKU: ${item.sku}`);
      if (item.specs) parts.push(`Spesifikasi: ${item.specs}`);
      if (item.parameters) {
        try {
          const params = JSON.parse(item.parameters);
          const paramParts = Object.entries(params).map(([key, value]) => `${key}: ${value}`);
          if (paramParts.length > 0) {
            parts.push(`Parameter: ${paramParts.join(', ')}`);
          }
        } catch {
          // not JSON, use as-is
          parts.push(`Parameter: ${item.parameters}`);
        }
      }
      if (item.condition) parts.push(`Kondisi: ${item.condition === 'good' ? 'Baik' : item.condition === 'new' ? 'Baru' : item.condition === 'fair' ? 'Cukup' : item.condition}`);
      if (item.room_name) parts.push(`Lokasi: ${item.room_name}`);
      if (item.container_name) parts.push(`Container: ${item.container_name}`);
      itemDescription = parts.join('\n');
    }

    setFormData(prev => ({
      ...prev,
      inventory_item_id: itemId,
      name: item ? item.name : prev.name,
      description: itemDescription || prev.description,
      condition: item?.condition || prev.condition,
      location_id: item ? String(item.room_id) : prev.location_id,
      responsible_user_id: responsibleId || prev.responsible_user_id
    }));

    // Auto-fill acquisition info from inventory item
    if (item?.acquisition_date || item?.acquisition_cost) {
      setFinancialData(prev => ({
        ...prev,
        acquisition_date: item.acquisition_date || prev.acquisition_date,
        acquisition_cost: item.acquisition_cost ? String(item.acquisition_cost) : prev.acquisition_cost
      }));
    }
  };

  useEffect(() => {
    if (selectedCategory && !isEditing) {
      setFinancialData(prev => ({
        ...prev,
        depreciation_method: selectedCategory.default_depreciation_method,
        useful_life_months: String(selectedCategory.default_useful_life_months),
        depreciation_rate: selectedCategory.default_depreciation_rate?.toString() || ''
      }));
    }
  }, [formData.asset_category_id, selectedCategory, isEditing]);

  useEffect(() => {
    if (isEditing || depreciationStartManuallyEdited) return;

    const depreciationStartDate = getDefaultDepreciationStartDate(financialData.acquisition_date);
    if (!depreciationStartDate) return;

    setFinancialData(prev => (
      prev.depreciation_start_date === depreciationStartDate
        ? prev
        : { ...prev, depreciation_start_date: depreciationStartDate }
    ));
  }, [financialData.acquisition_date, depreciationStartManuallyEdited, isEditing]);

  useEffect(() => {
    if (isEditing) return;
    if (
      generatedDocumentDate === financialData.acquisition_date &&
      generatedDocumentReference &&
      financialData.document_reference === generatedDocumentReference
    ) {
      return;
    }
    if (
      financialData.document_reference &&
      financialData.document_reference !== generatedDocumentReference
    ) {
      return;
    }

    let cancelled = false;

    const generateDocumentReference = async () => {
      try {
        const response = await fetch(DOCUMENT_NUMBERS_ENDPOINT, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            action: 'preview',
            date: financialData.acquisition_date
          })
        });
        const data = await response.json();
        if (cancelled || data.status !== 'success' || !data.documentNumber) return;

        setGeneratedDocumentReference(data.documentNumber);
        setGeneratedDocumentDate(financialData.acquisition_date);
        setFinancialData(prev => {
          if (prev.document_reference && prev.document_reference !== generatedDocumentReference) {
            return prev;
          }
          return { ...prev, document_reference: data.documentNumber };
        });
      } catch (err) {
        console.error('Failed to generate document number:', err);
      }
    };

    void generateDocumentReference();

    return () => {
      cancelled = true;
    };
  }, [
    financialData.acquisition_date,
    financialData.document_reference,
    generatedDocumentDate,
    generatedDocumentReference,
    isEditing
  ]);

  const calculateDepreciation = () => {
    const cost = parseFloat(String(financialData.acquisition_cost)) || 0;
    const salvage = parseFloat(String(financialData.salvage_value)) || 0;
    const months = parseInt(String(financialData.useful_life_months)) || 1;
    const rate = parseFloat(String(financialData.depreciation_rate)) || 0;

    if (cost <= 0 || months <= 0) return null;

    const depreciable = cost - salvage;
    let monthlyDep = 0;

    if (financialData.depreciation_method === 'straight_line') {
      monthlyDep = depreciable / months;
    } else if (financialData.depreciation_method === 'declining_balance' && rate > 0) {
      monthlyDep = (cost * (rate / 100)) / 12;
    }

    return {
      depreciable,
      monthly: monthlyDep,
      annual: monthlyDep * 12
    };
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        ...financialData,
        inventory_item_id: formData.inventory_item_id ? parseInt(String(formData.inventory_item_id)) : null,
        acquisition_cost: parseFloat(String(financialData.acquisition_cost)),
        salvage_value: parseFloat(String(financialData.salvage_value)) || 0,
        useful_life_months: parseInt(String(financialData.useful_life_months)),
        depreciation_rate: financialData.depreciation_rate ? parseFloat(String(financialData.depreciation_rate)) : null
      };

      const url = isEditing
        ? '/public/api/assets/assets.php'
        : '/public/api/assets/assets.php';

      const method = isEditing ? 'PUT' : 'POST';

      if (isEditing) {
        (payload as any).id = asset.id;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.status === 'success') {
        onSuccess();
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save asset');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);

  const depreciationCalc = calculateDepreciation();

  if (!canViewAssets) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 text-center">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Akses Ditolak</h2>
          <p className="text-sm text-slate-600 mb-4">
            Anda tidak memiliki akses ke detail aset melalui matriks Akuntansi Aset Tetap.
          </p>
          <button onClick={onClose} className="px-4 py-2 bg-[#000080] text-white rounded-lg hover:bg-[#000060]">
            Tutup
          </button>
        </div>
      </div>
    );
  }

  const isReadOnly = !canManageAssets;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-800">
            {isReadOnly ? 'Detail Aset' : isEditing ? 'Edit Aset' : 'Tambah Aset Baru'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(s => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s ? 'bg-[#000080] text-white' : 'bg-slate-200 text-slate-500'
                }`}>
                  {s}
                </div>
                <span className={`ml-2 text-sm ${step >= s ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>
                  {s === 1 ? 'Identitas' : s === 2 ? 'Keuangan' : 'Konfirmasi'}
                </span>
                {s < 3 && <div className="w-12 h-0.5 mx-4 bg-slate-200" />}
              </div>
            ))}
          </div>
        </div>

        {isReadOnly && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-100 text-sm text-amber-800">
            Mode akses <span className="font-semibold">View</span> — formulir hanya dapat dilihat.
          </div>
        )}

        {/* Content */}
        <fieldset disabled={isReadOnly} className="p-6 overflow-y-auto max-h-[60vh] border-0 min-w-0">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step 1: Identity */}
          {step === 1 && (
            <div className="space-y-4">
              {!isEditing && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tautan ke Barang Inventory</label>
                  <select
                    value={formData.inventory_item_id}
                    onChange={e => handleSelectItem(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                  >
                    <option value="">-- Pilih Barang (Opsional) --</option>
                    {inventoryItems.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.sku}) - {item.room_name || '-'}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Opsional - tautkan ke barang inventory yang sudah terdaftar
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kategori Aset</label>
                <select
                  value={formData.asset_category_id}
                  onChange={e => setFormData(prev => ({ ...prev, asset_category_id: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                >
                  <option value="">Pilih Kategori</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {selectedCategory && (
                  <p className="mt-1 text-xs text-slate-500">
                    Default: {selectedCategory.default_depreciation_method.replace('_', ' ')}, {selectedCategory.default_useful_life_months} bulan
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Aset *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                  placeholder="Contoh: Laptop Dell Inspiron 15"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                  rows={3}
                  placeholder="Nomor seri, spesifikasi, warna, dll"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Lokasi</label>
                  {selectedItemData ? (
                    <input
                      type="text"
                      value={selectedItemData.room_name || selectedItemData.container_name || '-'}
                      readOnly
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-600"
                    />
                  ) : (
                    <select
                      value={formData.location_id}
                      onChange={e => setFormData(prev => ({ ...prev, location_id: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                    >
                      <option value="">Pilih Lokasi</option>
                      {rooms.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}
                  {selectedItemData && (
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedItemData.container_name ? `Container: ${selectedItemData.container_name}` : ''}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Penanggungjawab</label>
                  {selectedItemData ? (
                    <input
                      type="text"
                      value={(() => {
                        const labTypes = ['biology', 'chemistry', 'physics', 'computer'];
                        if (labTypes.includes(selectedItemData.room_type)) {
                          const kepala = allUsers.find(k => k.role === 'kepala_lab' && k.lab_scope === selectedItemData.room_type);
                          return kepala?.name || '-';
                        }
                        // Non-lab rooms
                        const nonLabUser = allUsers.find(u => u.role === 'kepala_sekolah' || u.role === 'sarpras');
                        return nonLabUser?.name || '-';
                      })()}
                      readOnly
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-600"
                    />
                  ) : (
                    <select
                      value={formData.responsible_user_id}
                      onChange={e => setFormData(prev => ({ ...prev, responsible_user_id: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                    >
                      <option value="">Pilih Penanggungjawab</option>
                      {allUsers.filter(u => u.role === 'kepala_lab').map(k => (
                        <option key={k.id} value={k.id}>{k.name} (Kepala Lab {k.lab_scope})</option>
                      ))}
                      {allUsers.filter(u => u.role === 'kepala_sekolah').map(u => (
                        <option key={u.id} value={u.id}>{u.name} (Kepala Sekolah)</option>
                      ))}
                      {allUsers.filter(u => u.role === 'sarpras').map(u => (
                        <option key={u.id} value={u.id}>{u.name} (Sarana Prasarana)</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kondisi</label>
                {selectedItemData ? (
                  <input
                    type="text"
                    value={selectedItemData.condition === 'good' ? 'Baik' : selectedItemData.condition === 'service' ? 'Servis' : selectedItemData.condition === 'damaged' ? 'Rusak' : selectedItemData.condition}
                    readOnly
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 capitalize"
                  />
                ) : (
                  <div className="flex gap-4">
                    {['new', 'good', 'fair'].map(c => (
                      <label key={c} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="condition"
                          value={c}
                          checked={formData.condition === c}
                          onChange={e => setFormData(prev => ({ ...prev, condition: e.target.value }))}
                        />
                        <span className="capitalize">{c === 'new' ? 'Baru' : c === 'good' ? 'Baik' : 'Cukup'}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Financial */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Tanggal Perolehan *
                    <span className="relative inline-block group ml-1 align-middle">
                      <span className="text-slate-400 cursor-help">ℹ️</span>
                      <span className="absolute left-0 top-4 hidden group-hover:block w-64 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-[100]">
                        Tanggal aset dibeli atau diterima. Dari field ini ditentukan tahun pengurutan nomor aset (AST-YYYY-NNNN).
                        <span className="absolute -top-2 left-4 border-4 border-transparent border-b-slate-800"></span>
                      </span>
                    </span>
                  </label>
                  <input
                    type="date"
                    value={financialData.acquisition_date}
                    onChange={e => setFinancialData(prev => ({ ...prev, acquisition_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">No. Dokumen</label>
                  <input
                    type="text"
                    value={financialData.document_reference}
                    onChange={e => setFinancialData(prev => ({ ...prev, document_reference: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Vendor</label>
                <input
                  type="text"
                  value={financialData.vendor_name}
                  onChange={e => setFinancialData(prev => ({ ...prev, vendor_name: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sumber Dana *</label>
                <select
                  value={financialData.funding_source}
                  onChange={e => setFinancialData(prev => ({ ...prev, funding_source: e.target.value as FundingSource }))}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                >
                  {Object.entries(FUNDING_SOURCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Harga Perolehan (Rp) *</label>
                  <input
                    type="text"
                    value={financialData.acquisition_cost ? Number(financialData.acquisition_cost).toLocaleString('id-ID') : ''}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^\d]/g, '');
                      setFinancialData(prev => ({ ...prev, acquisition_cost: raw }));
                    }}
                    onBlur={e => {
                      const num = parseFloat(e.target.value.replace(/[^\d]/g, ''));
                      if (!isNaN(num)) {
                        setFinancialData(prev => ({ ...prev, acquisition_cost: String(num) }));
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Nilai Residu (Rp)
                    <span className="relative inline-block group ml-1 align-middle">
                      <span className="text-slate-400 cursor-help">ℹ️</span>
                      <span className="absolute top-4 right-0 hidden group-hover:block w-64 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-[100]">
                        Estimasi nilai aset di akhir masa manfaatnya. Nilai ini tidak akan disusutkan. Default 0% dari kategori.
                        <span className="absolute -top-2 right-4 border-4 border-transparent border-b-slate-800"></span>
                      </span>
                    </span>
                  </label>
                  <input
                    type="text"
                    value={financialData.salvage_value ? Number(financialData.salvage_value).toLocaleString('id-ID') : ''}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^\d]/g, '');
                      setFinancialData(prev => ({ ...prev, salvage_value: raw }));
                    }}
                    onBlur={e => {
                      const num = parseFloat(e.target.value.replace(/[^\d]/g, ''));
                      if (!isNaN(num)) {
                        setFinancialData(prev => ({ ...prev, salvage_value: String(num) }));
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Metode</label>
                  <select
                    value={financialData.depreciation_method}
                    onChange={e => setFinancialData(prev => ({ ...prev, depreciation_method: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                  >
                    <option value="straight_line">Garis Lurus</option>
                    <option value="declining_balance">Saldo Menurun</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Masa Manfaat (bulan)
                    <span className="relative inline-block group ml-1 align-middle">
                      <span className="text-slate-400 cursor-help">ℹ️</span>
                      <span className="absolute top-4 right-0 hidden group-hover:block w-64 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-[100]">
                        Lama waktu aset dapat digunakan dalam perhitungan penyusutan. Default sesuai kategori.
                        <span className="absolute -top-2 right-4 border-4 border-transparent border-b-slate-800"></span>
                      </span>
                    </span>
                  </label>
                  <input
                    type="number"
                    value={financialData.useful_life_months}
                    onChange={e => setFinancialData(prev => ({ ...prev, useful_life_months: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                  />
                </div>
                {financialData.depreciation_method === 'declining_balance' ? (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Tarif (%)
                      <span className="relative inline-block group ml-1 align-middle">
                        <span className="text-slate-400 cursor-help">ℹ️</span>
                        <span className="absolute top-4 right-0 hidden group-hover:block w-64 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-[100]">
                          Persentase pengurangan nilai buku per tahun. Contoh: 25% artinya nilai buku turun 25% setiap tahun, bukan dihitung dari harga awal.
                          <span className="absolute -top-2 right-4 border-4 border-transparent border-b-slate-800"></span>
                        </span>
                      </span>
                    </label>
                    <input
                      type="number"
                      value={financialData.depreciation_rate}
                      onChange={e => setFinancialData(prev => ({ ...prev, depreciation_rate: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                      placeholder="25"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">&nbsp;</label>
                    <div className="h-[42px]"></div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tanggal Mulai Penyusutan
                  <span className="relative inline-block group ml-1 align-middle">
                    <span className="text-slate-400 cursor-help">ℹ️</span>
                    <span className="absolute left-0 top-4 hidden group-hover:block w-64 p-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-[100]">
                        Tanggal pertama kali penyusutan dihitung. Default mengikuti tanggal perolehan.
                      <span className="absolute -top-2 left-4 border-4 border-transparent border-b-slate-800"></span>
                    </span>
                  </span>
                </label>
                <input
                  type="date"
                  value={financialData.depreciation_start_date}
                  onChange={e => {
                    setDepreciationStartManuallyEdited(true);
                    setFinancialData(prev => ({ ...prev, depreciation_start_date: e.target.value }));
                  }}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#000080]/20"
                />
              </div>

              {/* Depreciation Preview */}
              {depreciationCalc && financialData.acquisition_cost && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="font-medium text-slate-700 mb-2">Preview Penyusutan</h4>
                  <div className="text-xs text-slate-500 mb-3 font-mono">
                    {financialData.depreciation_method === 'straight_line' ? (
                      <>Penyusutan = (Harga Perolehan - Nilai Residu) ÷ Masa Manfaat<br />
                      ({formatCurrency(parseFloat(String(financialData.acquisition_cost)))} - {formatCurrency(parseFloat(String(financialData.salvage_value)) || 0)}) ÷ {financialData.useful_life_months} bulan</>
                    ) : (
                      <>Penyusutan = Harga Perolehan × Tarif ÷ 12<br />
                      {formatCurrency(parseFloat(String(financialData.acquisition_cost)))} × {financialData.depreciation_rate}% ÷ 12</>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Nilai Terhitung</span>
                      <div className="font-semibold">{formatCurrency(depreciationCalc.depreciable)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Per Bulan</span>
                      <div className="font-semibold text-[#000080]">{formatCurrency(depreciationCalc.monthly)}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Per Tahun</span>
                      <div className="font-semibold">{formatCurrency(depreciationCalc.annual)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <h4 className="font-medium text-slate-700 mb-3">Ringkasan Aset</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Nama Aset</dt>
                    <dd className="font-medium">{formData.name || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Kategori</dt>
                    <dd className="font-medium">{selectedCategory?.name || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Tanggal Perolehan</dt>
                    <dd className="font-medium">{financialData.acquisition_date}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Harga Perolehan</dt>
                    <dd className="font-medium">{financialData.acquisition_cost ? formatCurrency(parseFloat(String(financialData.acquisition_cost))) : '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Sumber Dana</dt>
                    <dd className="font-medium">{FUNDING_SOURCE_LABELS[financialData.funding_source] || '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Nilai Residu</dt>
                    <dd className="font-medium">{financialData.salvage_value ? formatCurrency(parseFloat(String(financialData.salvage_value))) : '-'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Metode</dt>
                    <dd className="font-medium capitalize">{financialData.depreciation_method.replace('_', ' ')}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Masa Manfaat</dt>
                    <dd className="font-medium">{financialData.useful_life_months} bulan</dd>
                  </div>
                </dl>
              </div>

              {!isEditing && (
                <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" className="mt-1 accent-[#000080]" required />
                  <span className="text-sm text-slate-600">
                    Saya menyatakan data aset sudah benar dan siap untuk disimpan. Penyusutan akan dihitung secara otomatis sesuai metode yang dipilih.
                  </span>
                </label>
              )}
            </div>
          )}
        </fieldset>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex justify-between">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="px-4 py-2 text-slate-600 hover:text-slate-800"
          >
            {step > 1 ? 'Kembali' : 'Batal'}
          </button>
          <div className="flex gap-2">
            {step < 3 && (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={step === 1 && !formData.name}
                className="px-6 py-2 bg-[#000080] text-white rounded-lg hover:bg-[#000060] disabled:opacity-50"
              >
                Lanjut
              </button>
            )}
            {step === 3 && !isReadOnly && (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-2 bg-[#000080] text-white rounded-lg hover:bg-[#000060] disabled:opacity-50"
              >
                {loading ? 'Menyimpan...' : 'Simpan Aset'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
