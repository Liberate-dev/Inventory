import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';
import { Wrench, Plus } from 'lucide-react';

interface MaintenanceRec {
  id: string;
  itemName: string;
  reason: string;
  recommendedDate: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
}

export default function PreventiveMaintenancePage() {
  const { user } = useAuth();
  const { canSee, canEditFeature } = useAccessMatrix();
  const [recs, setRecs] = useState<MaintenanceRec[]>([
    { id: 'm1', itemName: 'Mikroskop Lab Biologi', reason: 'Berdasarkan tanggal perolehan + frekuensi pemakaian tinggi', recommendedDate: '2026-06-20', status: 'pending' },
  ]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ itemName: '', reason: '', recommendedDate: '' });

  const canManage = user ? canEditFeature('preventive_maintenance', user.role) : false;

  const handleAccept = (id: string) => {
    setRecs(recs.map(r => r.id === id ? { ...r, status: 'scheduled' } : r));
    alert('Jadwal pemeliharaan diterima. Mirip disposal: akan diingatkan mendekati tanggal, bisa dibatalkan. Eksekusi akan update log/item condition.');
  };

  const handleComplete = (id: string) => {
    setRecs(recs.map(r => r.id === id ? { ...r, status: 'completed' } : r));
    alert('Pemeliharaan selesai. (Di real: append log PREVENTIVE_MAINTENANCE_COMPLETED, update last maintenance).');
  };

  if (!canSee('preventive_maintenance', user?.role || 'guru')) {
    return <div className="p-8">Tidak ada akses ke Pemeliharaan Preventif.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench /> Pemeliharaan Preventif (AI + Jadwal)</h1>
          <p className="text-sm text-slate-500">Rekomendasi via AI (direct call dengan key Anda), penjadwalan otomatis mirip disposal (hold + reminder + cancel sebelum tanggal).</p>
        </div>
        {canManage && <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-[#000080] text-white rounded flex items-center gap-2"><Plus size={16}/> Buat Rekomendasi Manual</button>}
      </div>

      {showForm && (
        <div className="bg-white p-4 border rounded">
          <input className="border p-2 mr-2" placeholder="Item" value={formData.itemName} onChange={e=>setFormData({...formData,itemName:e.target.value})} />
          <input className="border p-2 mr-2" placeholder="Alasan (AI akan generate)" value={formData.reason} onChange={e=>setFormData({...formData,reason:e.target.value})} />
          <input type="date" className="border p-2 mr-2" value={formData.recommendedDate} onChange={e=>setFormData({...formData,recommendedDate:e.target.value})} />
          <button onClick={() => { /* add logic */ alert('Rekomendasi ditambahkan (AI call placeholder)'); setShowForm(false); }} className="px-4 py-2 bg-emerald-600 text-white rounded">Tambah + Panggil AI</button>
        </div>
      )}

      <div className="bg-white rounded border">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50"><th className="p-3 text-left">Item</th><th>Alasan / AI Rec</th><th>Jadwal</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {recs.map(rec => (
              <tr key={rec.id} className="border-t">
                <td className="p-3">{rec.itemName}</td>
                <td className="p-3 text-xs">{rec.reason}</td>
                <td className="p-3 text-center font-mono text-xs">{rec.recommendedDate}</td>
                <td className="p-3 text-center"><span className="px-2 py-0.5 rounded text-xs bg-amber-100">{rec.status}</span></td>
                <td className="p-3">
                  {rec.status === 'pending' && canManage && <button onClick={() => handleAccept(rec.id)} className="text-emerald-600">Terima & Jadwalkan</button>}
                  {rec.status === 'scheduled' && <button onClick={() => handleComplete(rec.id)} className="text-[#000080]">Tandai Selesai</button>}
                  {rec.status === 'scheduled' && <button onClick={() => { if(confirm('Batalkan?')) setRecs(recs.map(r=>r.id===rec.id?{...r,status:'cancelled'}:r)); }} className="ml-2 text-amber-600">Batalkan</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-500">Demo UI. Full AI call, scheduled job, notif, dan integration dengan item logs akan dilanjutkan. Matrix sudah mengatur akses (sarpras & kepala_sekolah).</div>
    </div>
  );
}
