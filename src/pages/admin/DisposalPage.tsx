import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';
import { getAuthHeaders } from '../../utils/api';
import { Trash2, Plus, Clock, CheckCircle, XCircle } from 'lucide-react';

interface DisposalRequest {
  id: string;
  itemName: string;
  itemId?: string | number;
  reason: string;
  proposedDate: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  requestedBy: string;
}

export default function DisposalPage() {
  const { user } = useAuth();
  const { canSee, canEditFeature } = useAccessMatrix();

  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [requests, setRequests] = useState<DisposalRequest[]>([
    // Demo data - in real would come from API
    { id: 'd1', itemName: 'Server Lama Lab Komputer', reason: 'End of life, diganti unit baru', proposedDate: '2026-07-15', status: 'pending', requestedBy: 'sarpras.1' },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ itemName: '', reason: '', proposedDate: '' });
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api');

  const canCreate = user ? canEditFeature('disposal', user.role) : false;
  const canApprove = user ? canEditFeature('disposal', user.role) : false; // kepala_sekolah full
  const today = new Date().toISOString().split('T')[0];

  // Fetch full list of inventory items (same endpoint used by asset forms & item mgmt)
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/inventory/items_management.php`, {
          headers: getAuthHeaders(),
        });
        const data = await response.json();
        if (data.status === 'success') {
          setInventoryItems(data.items || []);
        }
      } catch (err) {
        console.error('Failed to fetch items for disposal form:', err);
      }
    };
    fetchItems();
  }, [API_BASE_URL]);

  const handleSelectItem = (itemId: string) => {
    const item = inventoryItems.find((i: any) => String(i.id) === itemId);
    setSelectedItem(item || null);
    setFormData(prev => ({
      ...prev,
      itemName: item ? item.name : '',
    }));
  };

  const resetForm = () => {
    setFormData({ itemName: '', reason: '', proposedDate: '' });
    setSelectedItem(null);
  };

  const handleCreate = () => {
    if (!selectedItem || !formData.reason.trim() || !formData.proposedDate) {
      alert('Pilih item dari daftar, isi alasan, dan tentukan tanggal jadwal.');
      return;
    }
    if (formData.proposedDate < today) {
      alert('Tanggal pengajuan disposal tidak boleh sebelum hari ini.');
      return;
    }
    const newReq: DisposalRequest = {
      id: 'd' + Date.now(),
      itemName: selectedItem.name,
      itemId: selectedItem.id,
      reason: formData.reason.trim(),
      proposedDate: formData.proposedDate,
      status: 'pending',
      requestedBy: user?.username || 'unknown',
    };
    setRequests([...requests, newReq]);
    resetForm();
    setShowForm(false);
    alert('Permintaan disposal dibuat. Menunggu persetujuan Kepala Sekolah. Sistem akan hold soft-delete sampai tanggal jadwal.');
  };

  const handleApprove = (id: string, approve: boolean) => {
    setRequests(requests.map(r => 
      r.id === id ? { ...r, status: approve ? 'approved' : 'rejected' } : r
    ));
    if (approve) {
      alert('Disposal disetujui. Soft delete akan dieksekusi otomatis pada tanggal jadwal. Reminder akan dikirim mendekati tanggal.');
    }
  };

  const handleCancel = (id: string) => {
    if (confirm('Batalkan permintaan disposal ini?')) {
      setRequests(requests.filter(r => r.id !== id));
    }
  };

  // Simulate execution on date (in real, background job)
  const simulateExecute = (id: string) => {
    setRequests(requests.map(r => r.id === id ? { ...r, status: 'executed' } : r));
    alert('Disposal dieksekusi: item soft-deleted, notifikasi terkirim.');
  };

  if (!canSee('disposal', user?.role || 'guru')) {
    return <div className="p-8">Anda tidak memiliki akses ke fitur Disposal.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Trash2 /> Disposal / Pelepasan Aset</h1>
          <p className="text-sm text-slate-500">Hak sarpras untuk mengajukan, persetujuan Kepala Sekolah. Soft delete ditahan sampai jadwal.</p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              if (showForm) resetForm();
              setShowForm(!showForm);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#000080] text-white rounded-lg"
          >
            <Plus size={16} /> Ajukan Disposal
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <div className="bg-white p-6 rounded-xl border">
          <h3 className="font-semibold mb-4">Form Permintaan Disposal Baru</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Item / Aset *</label>
              <select
                value={selectedItem ? String(selectedItem.id) : ''}
                onChange={e => handleSelectItem(e.target.value)}
                className="w-full border p-2 rounded focus:ring-2 focus:ring-[#000080]/20"
              >
                <option value="">-- Pilih Item dari Inventory yang sudah ada --</option>
                {inventoryItems.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name} {item.sku ? `(${item.sku})` : ''} — {item.room_name || 'Tanpa ruangan'}{item.container_name ? ` / ${item.container_name}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Pilih dari daftar barang inventory yang terdaftar. Ketik manual tidak diperbolehkan.</p>
            </div>

            {selectedItem && (
              <div className="bg-slate-50 border rounded-lg p-3 text-sm">
                <div className="font-medium text-slate-700 mb-2 flex items-center gap-2">
                  Informasi Item Terpilih
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-slate-600">
                  <div><span className="text-slate-500">Nama:</span> {selectedItem.name}</div>
                  <div><span className="text-slate-500">SKU:</span> {selectedItem.sku || '-'}</div>
                  <div><span className="text-slate-500">Kondisi:</span> <span className="capitalize">{selectedItem.condition || '-'}</span></div>
                  <div><span className="text-slate-500">Lokasi:</span> {selectedItem.room_name || '-'}{selectedItem.container_name ? ` / ${selectedItem.container_name}` : ''}</div>
                  <div className="md:col-span-2"><span className="text-slate-500">Spesifikasi:</span> {selectedItem.specs || '-'}</div>
                </div>
                {selectedItem.parameters && (
                  <div className="mt-1 text-xs text-slate-500">
                    Parameter: {typeof selectedItem.parameters === 'string' ? selectedItem.parameters : JSON.stringify(selectedItem.parameters)}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Alasan Disposal *</label>
                <input
                  className="w-full border p-2 rounded"
                  placeholder="Contoh: Rusak berat, tidak dapat diperbaiki, end of life"
                  value={formData.reason}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jadwal Pelaksanaan *</label>
                <input
                  type="date"
                  min={today}
                  className="w-full border p-2 rounded"
                  value={formData.proposedDate}
                  onChange={e => setFormData({ ...formData, proposedDate: e.target.value })}
                />
              </div>
            </div>
          </div>
          <button onClick={handleCreate} className="mt-4 px-6 py-2 bg-emerald-600 text-white rounded">Ajukan (akan ditahan sampai jadwal)</button>
          <p className="text-xs text-slate-500 mt-2">Setelah disetujui, sistem akan mengingatkan mendekati tanggal dan mengeksekusi soft delete + notif pada tanggal tersebut. Bisa dibatalkan sebelum eksekusi.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-3 text-left">Item</th>
              <th className="p-3 text-left">Alasan</th>
              <th className="p-3">Jadwal</th>
              <th className="p-3">Status</th>
              <th className="p-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.id} className="border-t">
                <td className="p-3">{req.itemName}</td>
                <td className="p-3 text-xs text-slate-600">{req.reason}</td>
                <td className="p-3 text-center font-mono text-xs">{req.proposedDate}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : req.status === 'pending' ? 'bg-amber-100 text-amber-700' : req.status === 'executed' ? 'bg-slate-200' : 'bg-red-100 text-red-700'}`}>
                    {req.status}
                  </span>
                </td>
                <td className="p-3 text-center space-x-1">
                  {req.status === 'pending' && canApprove && (
                    <>
                      <button onClick={() => handleApprove(req.id, true)} className="text-emerald-600 hover:underline"><CheckCircle size={14} /> Setujui</button>
                      <button onClick={() => handleApprove(req.id, false)} className="text-red-600 hover:underline"><XCircle size={14} /> Tolak</button>
                    </>
                  )}
                  {req.status === 'approved' && (
                    <button onClick={() => handleCancel(req.id)} className="text-amber-600 hover:underline"><Clock size={14} /> Batalkan (sebelum jadwal)</button>
                  )}
                  {req.status === 'approved' && new Date(req.proposedDate) <= new Date() && (
                    <button onClick={() => simulateExecute(req.id)} className="text-[#000080] hover:underline">Eksekusi Sekarang (simulasi)</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">
        Catatan: Fitur penuh (API, notifikasi otomatis, reminder, eksekusi scheduled, link ke soft delete item/asset) akan dilengkapi di langkah berikutnya. Saat ini demo dengan matrix gate.
      </div>
    </div>
  );
}
