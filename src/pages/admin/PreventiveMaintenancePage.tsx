import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAccessMatrix } from '../../context/AccessMatrixContext';
import { useInventory } from '../../context/InventoryContext';
import { useNotifications } from '../../context/NotificationContext';
import { useToast } from '../../context/ToastContext';
import { Wrench, Calendar, Loader2, Sparkles, Zap } from 'lucide-react';
import { getProcurementDateFromLogs } from '../../utils/itemHistory';
import { getMaintenanceRecommendations, hasAnyAIKey, getAIStatus, generateSmartCodeWithAI, type RichItemForAI } from '../../utils/aiClient';
import { buildFallbackSmartCode } from '../../utils/inventoryCode';
import { getAuthHeaders } from '../../utils/api';
import type { Room } from '../../types';

interface MaintenanceTask {
  id: string;
  itemId: string;
  itemName: string;
  roomName: string;
  sku?: string;           // unique label / inventory code for the specific physical item
  reason: string;
  recommendedDate: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled' | 'rejected';
  source: 'ai' | 'manual';
  cancelReason?: string;
}

// Derive preventive maintenance schedules from persisted item logs (accurate & persistent).
// Returns active (including overdue) and history (completed/cancelled).
// Overdue = scheduled date < today AND no terminal action yet.
// This directly addresses "what happens when jadwal lewat".
function getPreventiveMaintenanceSchedules(rooms: Room[]): {
  active: (MaintenanceTask & { isOverdue: boolean })[];
  history: MaintenanceTask[];
} {
  const active: (MaintenanceTask & { isOverdue: boolean })[] = [];
  const history: MaintenanceTask[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  rooms.forEach(room => {
    (room.containers || []).forEach(container => {
      (container.items || []).forEach(item => {
        const sortedLogs = [...(item.logs || [])].sort((a, b) =>
          (b.date || '').localeCompare(a.date || '')
        );

        let lastScheduledLog: any = null;
        let terminalLog: any = null;

        for (const log of sortedLogs) {
          if (log.action === 'PREVENTIVE_MAINTENANCE_SCHEDULED') {
            if (!lastScheduledLog) lastScheduledLog = log; // most recent schedule before any terminal
          }
          if (log.action === 'PREVENTIVE_MAINTENANCE_COMPLETED' || log.action === 'PREVENTIVE_MAINTENANCE_CANCELLED') {
            terminalLog = log;
            break; // terminal after the latest schedule
          }
        }

        if (terminalLog && lastScheduledLog) {
          // History entry
          try {
            const sd = JSON.parse(lastScheduledLog.details || '{}');
            const td = JSON.parse(terminalLog.details || '{}');
            history.push({
              id: terminalLog.id,
              itemId: item.id,
              itemName: item.name,
              roomName: room.name,
              sku: item.sku,
              reason: sd.reason || '',
              recommendedDate: sd.recommendedDate || (lastScheduledLog.date || '').split('T')[0],
              status: terminalLog.action === 'PREVENTIVE_MAINTENANCE_COMPLETED' ? 'completed' : 'cancelled',
              source: (sd.source as 'ai' | 'manual') || 'manual',
              cancelReason: td.cancelReason
            });
          } catch {
            // ignore malformed log details
          }
        } else if (lastScheduledLog) {
          // Still active (or overdue)
          try {
            const d = JSON.parse(lastScheduledLog.details || '{}');
            const recDate = d.recommendedDate || (lastScheduledLog.date || '').split('T')[0];
            const isOverdue = recDate < todayStr;
            active.push({
              id: lastScheduledLog.id,
              itemId: item.id,
              itemName: item.name,
              roomName: room.name,
              sku: item.sku,
              reason: d.reason || '',
              recommendedDate: recDate,
              status: 'scheduled',
              source: (d.source as 'ai' | 'manual') || 'manual',
              cancelReason: undefined,
              isOverdue
            });
          } catch {
            // ignore malformed log details
          }
        }
      });
    });
  });

  // Sort history newest first
  history.sort((a, b) => (b.recommendedDate || '').localeCompare(a.recommendedDate || ''));

  return { active, history };
}

export default function PreventiveMaintenancePage() {
  const { user } = useAuth();
  const { canSee, canEditFeature } = useAccessMatrix();
  const { rooms, schedulePreventiveMaintenance, completePreventiveMaintenance, cancelPreventiveMaintenance, refreshRooms } = useInventory();
  const { showToast } = useToast();
  const aiStatus = getAIStatus();

  const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api').replace(/\/+$/, '');

  // Auto-generate and persist SKU for items that don't have one yet
  // Called before scheduling maintenance so the item always has a code visible across all pages
  const ensureItemHasSku = async (item: { id: string; name: string; roomName: string; sku?: string }): Promise<string | undefined> => {
    if (item.sku) return item.sku; // already has a code

    let generatedSku: string;
    try {
      const res = await generateSmartCodeWithAI(item.name, undefined, item.roomName);
      generatedSku = res.suggestedSku;
    } catch {
      // Fallback: [Ruangan]-[Nama]-[Nomor] formula
      generatedSku = buildFallbackSmartCode(item.roomName, item.name, Math.floor(Date.now() % 9000) + 1000, 4);
    }

    // Persist to DB via items_management update_sku
    try {
      const res = await fetch(`${API_BASE_URL}/inventory/items_management.php`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'update_sku', item_id: item.id, sku: generatedSku })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'success') {
        // Silently refresh rooms so all pages pick up the new code
        void refreshRooms();
        return generatedSku;
      }
    } catch (err) {
      console.warn('Could not persist auto-generated SKU:', err);
    }
    return generatedSku; // return even if persist failed (shows in UI)
  };

  // Flatten all items from rooms/containers for dropdown + auto-fill (for manual + AI context)
  // We include sku so that maintenance can be clearly targeted to a specific labeled physical instance
  // (e.g. "Meja" type but different INV- codes in different rooms are treated as distinct items).
  const allSelectableItems = useMemo(() => {
    const list: Array<{ id: string; name: string; roomName: string; condition: string; sku?: string }> = [];
    rooms.forEach(room => {
      (room.containers || []).forEach((container: any) => {
        (container.items || []).forEach((item: any) => {
          list.push({
            id: item.id,
            name: item.name,
            roomName: room.name,
            condition: item.condition || item.status || 'good',
            sku: item.sku
          });
        });
      });
    });
    return list;
  }, [rooms]);

  // Active (incl. overdue) + history derived from REAL persisted item logs (accurate & survive refresh)
  const { active: scheduledTasks, history: historyTasks } = useMemo(
    () => getPreventiveMaintenanceSchedules(rooms),
    [rooms]
  );

  // Only the *pending* AI suggestions live in local state (ephemeral until accepted)
  const [pendingAiRecs, setPendingAiRecs] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const canManage = user ? canEditFeature('preventive_maintenance', user.role) : false;

  // Items that already have an active preventive schedule (used to avoid duplicate AI suggestions + manual warnings)
  const itemsWithActiveSchedule = useMemo(() => {
    const s = new Set<string>();
    scheduledTasks.forEach(t => s.add(t.itemId));
    return s;
  }, [scheduledTasks]);

  // Map of itemId -> current active due date (for showing info in manual form when user picks an item that already has a schedule)
  const activeScheduleDueDates = useMemo(() => {
    const map = new Map<string, string>();
    scheduledTasks.forEach(t => map.set(t.itemId, t.recommendedDate));
    return map;
  }, [scheduledTasks]);

  const { addNotification } = useNotifications();

  // Lightweight client-side reminders (on load / when data changes).
  // Scans active schedules for overdue and upcoming (within 7 days).
  // Uses existing NotificationContext (same pattern as ServiceRequestContext).
  // Only for managers; dedup is handled by the notification store cap.
  useEffect(() => {
    if (!canManage || scheduledTasks.length === 0) return;

    const now = new Date();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    scheduledTasks.forEach((task: any) => {
      const recDate = task.recommendedDate;
      if (!recDate) return;

      const itemLabel = task.sku ? `${task.itemName} (${task.sku})` : task.itemName;
      if (task.isOverdue) {
        addNotification({
          title: 'Pemeliharaan Terlambat',
          message: `Jadwal untuk ${itemLabel} di ${task.roomName} sudah lewat (${recDate}). Segera tindak lanjuti.`,
          type: 'warning'
        });
      } else {
        const due = new Date(recDate);
        const diff = due.getTime() - now.getTime();
        if (diff > 0 && diff <= sevenDaysMs) {
          const days = Math.ceil(diff / (1000 * 3600 * 24));
          addNotification({
            title: 'Pemeliharaan Mendatang',
            message: `${itemLabel} dijadwalkan dalam ${days} hari (${recDate}).`,
            type: 'info'
          });
        }
      }
    });
  }, [scheduledTasks, canManage, addNotification]);

  // Pending AI suggestions (local/ephemeral until user accepts → persisted as SCHEDULED)
  const aiRecommendations = pendingAiRecs;

  // Build rich context for AI (dates, logs, age, condition history).
  // Shape matches RichItemForAI from aiClient.
  // Excludes items with active persisted schedule for accuracy.
  function buildItemsContextForAI(maxItems = 25): RichItemForAI[] {
    const richItems: RichItemForAI[] = [];

    rooms.forEach(room => {
      (room.containers || []).forEach((container: any) => {
        (container.items || []).forEach((item: any) => {
          if (itemsWithActiveSchedule.has(item.id)) return;
          if (richItems.length >= maxItems) return;

          const procurement = getProcurementDateFromLogs(item.logs, (item as any).created_at || (item as any).acquisition_date);
          let ageMonths = 0;
          if (procurement && procurement !== '-') {
            const d = new Date(procurement);
            if (!isNaN(d.getTime())) {
              const now = new Date();
              ageMonths = Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
            }
          }

          const logSummary = (item.logs || [])
            .slice(-3)
            .map((l: any) => `${l.date?.slice(0,10) || ''} ${l.action}`)
            .join(' | ');

          const paramSummary = (item.parameters || [])
            .map((p: any) => `${p.label}:${p.value}`)
            .slice(0, 3)
            .join('; ');

          richItems.push({
            id: item.id,
            name: item.name,
            roomName: room.name,
            condition: item.condition || item.status || 'good',
            sku: item.sku,
            procurementDate: procurement || '-',
            ageMonths,
            recentLogs: logSummary || 'tidak ada log',
            specs: [item.specs, paramSummary].filter(Boolean).join(' ').slice(0, 180)
          });
        });
      });
    });

    return richItems;
  }

  // Generate AI recommendations using the multi-provider router (Gemini → OpenRouter → Cerebras).
  // Matches the quality routing from Professional Assistant/server/services/aiRouter.js.
  const generateAIRecommendations = async () => {
    if (aiLoading) return;

    const contextItems = buildItemsContextForAI(25);

    if (contextItems.length === 0) {
      showToast('Belum ada data inventaris untuk dianalisis atau semua item sudah punya jadwal/rekomendasi aktif.', 'error');
      return;
    }

    setAiLoading(true);

    try {
      if (!hasAnyAIKey()) {
        // No keys at all → simulation (original behavior)
        const picked = [...contextItems].sort(() => 0.5 - Math.random()).slice(0, 3);
        const today = new Date();
        const simRecs = picked.map((item, index) => {
          const d = new Date(today);
          d.setDate(d.getDate() + 14 + index * 10);
          return {
            itemId: item.id,
            reason: `Analisis AI (simulasi): Kondisi "${item.condition}", usia ~${item.ageMonths} bulan, procurement ${item.procurementDate}. Disarankan pemeliharaan preventif berdasarkan usia dan riwayat.`,
            recommendedDate: d.toISOString().split('T')[0]
          };
        });

        const contextMap = new Map(contextItems.map(i => [i.id, i]));
        const newAI: MaintenanceTask[] = simRecs.map((rec, index) => {
          const ctx = contextMap.get(rec.itemId);
          return {
            id: `ai-${Date.now()}-${index}`,
            itemId: rec.itemId,
            itemName: ctx?.name || 'Item',
            roomName: ctx?.roomName || '-',
            sku: ctx?.sku,
            reason: rec.reason,
            recommendedDate: rec.recommendedDate,
            status: 'pending',
            source: 'ai'
          };
        });

        setPendingAiRecs(prev => [...prev, ...newAI]);
        showToast('Tidak ada API key AI — menggunakan simulasi. Set key di file .env untuk AI sungguhan.', 'error');
        return;
      }

      // Real multi-provider call (quality routing)
      const { recommendations, provider } = await getMaintenanceRecommendations(contextItems);

      if (!recommendations || recommendations.length === 0) {
        showToast('AI tidak memberikan rekomendasi baru saat ini.', 'error');
        return;
      }

      const contextMap = new Map(contextItems.map(i => [i.id, i]));
      const newAI: MaintenanceTask[] = recommendations.map((rec, index) => {
        const ctx = contextMap.get(rec.itemId);
        return {
          id: `ai-${Date.now()}-${index}`,
          itemId: rec.itemId,
          itemName: ctx?.name || 'Item',
          roomName: ctx?.roomName || '-',
          sku: ctx?.sku,
          reason: rec.reason,
          recommendedDate: rec.recommendedDate,
          status: 'pending',
          source: 'ai'
        };
      });

      setPendingAiRecs(prev => [...prev, ...newAI]);

      // Friendly feedback which provider actually answered
      const providerLabel = provider === 'gemini' ? 'Gemini' : provider === 'openrouter' ? 'OpenRouter' : provider === 'cerebras' ? 'Cerebras' : 'AI';
      showToast(`✅ ${recommendations.length} rekomendasi dari ${providerLabel}`, 'success');
    } catch (err: any) {
      console.error('AI recommendation error', err);

      const isGeminiQuota = String(err?.message || '').includes('GEMINI_QUOTA_EXHAUSTED');

      // Final fallback to simulation so the feature never becomes unusable
      const picked = [...contextItems].sort(() => 0.5 - Math.random()).slice(0, 3);
      const today = new Date();
      const fallback: MaintenanceTask[] = picked.map((item, index) => {
        const d = new Date(today);
        d.setDate(d.getDate() + 14 + index * 10);
        return {
          id: `ai-${Date.now()}-${index}`,
          itemId: item.id,
          itemName: item.name,
          roomName: item.roomName,
          reason: `Analisis AI (fallback): Kondisi "${item.condition}", usia ~${item.ageMonths} bulan. Disarankan pemeliharaan berdasarkan tanggal perolehan dan riwayat.`,
          recommendedDate: d.toISOString().split('T')[0],
          status: 'pending',
          source: 'ai'
        };
      });
      setPendingAiRecs(prev => [...prev, ...fallback]);

      if (isGeminiQuota) {
        showToast('Gemini quota habis. Menggunakan simulasi — buat API key baru di AI Studio.', 'error');
      } else {
        showToast('Gagal memanggil AI. Menggunakan simulasi fallback.', 'error');
      }
    } finally {
      setAiLoading(false);
    }
  };

  // Accept AI recommendation → persist as SCHEDULED (accurate persistence)
  // Also ensures item has an AI-generated SKU (persisted) before scheduling
  const acceptAIRecommendation = async (id: string) => {
    const rec = pendingAiRecs.find((r: any) => r.id === id);
    if (!rec) return;

    try {
      // Step 1: Ensure item has a persisted SKU
      const sku = await ensureItemHasSku({ id: rec.itemId, name: rec.itemName, roomName: rec.roomName, sku: rec.sku });
      if (sku && sku !== rec.sku) {
        // Update local pending rec with the newly assigned code
        setPendingAiRecs(prev => prev.map((r: any) => r.id === id ? { ...r, sku } : r));
      }

      // Step 2: Persist maintenance schedule
      await schedulePreventiveMaintenance(rec.itemId, rec.recommendedDate, rec.reason, 'ai');
      setPendingAiRecs(prev => prev.filter((r: any) => r.id !== id));

      const codeInfo = sku ? ` [${sku}]` : '';
      showToast(`Rekomendasi AI diterima & dijadwalkan${codeInfo}.`, 'success');
    } catch (e: any) {
      showToast('Gagal menyimpan jadwal: ' + (e?.message || e), 'error');
    }
  };

  // Reject AI recommendation (local only, not persisted)
  const rejectAIRecommendation = (id: string) => {
    if (!confirm('Tolak rekomendasi AI ini?')) return;
    setPendingAiRecs(prev => prev.filter((r: any) => r.id !== id));
  };

  // Manual scheduling form
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({
    itemId: '',
    itemName: '',
    roomName: '',
    condition: '',
    sku: '',
    reason: '',
    recommendedDate: ''
  });

  // Edit active schedule
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    reason: '',
    recommendedDate: ''
  });

  const today = new Date().toISOString().split('T')[0];

  const handleManualItemSelect = (itemId: string) => {
    const found = allSelectableItems.find(i => i.id === itemId);
    if (!found) return;

    setManualForm({
      itemId: found.id,
      itemName: found.name,
      roomName: found.roomName,
      condition: found.condition,
      sku: found.sku || '',
      reason: '',
      recommendedDate: ''
    });
  };

  const submitManualSchedule = async () => {
    if (!manualForm.itemId || !manualForm.recommendedDate || !manualForm.reason.trim()) {
      showToast('Pilih item, isi alasan, dan pilih tanggal pemeliharaan.', 'error');
      return;
    }

    try {
      // Ensure item has a SKU before scheduling
      const sku = await ensureItemHasSku({ id: manualForm.itemId, name: manualForm.itemName, roomName: manualForm.roomName, sku: manualForm.sku || undefined });
      if (sku && sku !== manualForm.sku) {
        setManualForm(prev => ({ ...prev, sku }));
      }

      await schedulePreventiveMaintenance(
        manualForm.itemId,
        manualForm.recommendedDate,
        manualForm.reason.trim(),
        'manual'
      );
      setShowManualForm(false);
      setManualForm({ itemId: '', itemName: '', roomName: '', condition: '', sku: '', reason: '', recommendedDate: '' });
      showToast('Jadwal manual berhasil disimpan.', 'success');
    } catch (e: any) {
      showToast('Gagal menyimpan jadwal manual: ' + (e?.message || e), 'error');
    }
  };

  const markComplete = async (task: MaintenanceTask) => {
    try {
      await completePreventiveMaintenance(task.itemId);
      showToast('Pemeliharaan selesai. Kondisi item direset ke good.', 'success');
    } catch (e: any) {
      showToast('Gagal menyelesaikan: ' + (e?.message || e), 'error');
    }
  };

  // Cancel with reason modal
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const openCancelModal = (id: string) => {
    setCancellingTaskId(id);
    setCancelReason('');
  };

  const confirmCancelSchedule = async () => {
    if (!cancellingTaskId) return;
    const task = scheduledTasks.find((t) => t.id === cancellingTaskId);
    if (!task) return;

    if (!cancelReason.trim()) {
      alert('Alasan pembatalan wajib diisi.');
      return;
    }

    try {
      await cancelPreventiveMaintenance(task.itemId, cancelReason.trim());
      setCancellingTaskId(null);
      setCancelReason('');
      showToast('Jadwal pemeliharaan dibatalkan.', 'success');
    } catch (e: any) {
      showToast('Gagal membatalkan: ' + (e?.message || e), 'error');
    }
  };

  const closeCancelModal = () => {
    setCancellingTaskId(null);
    setCancelReason('');
  };

  // Start editing an active (persisted) schedule
  const startEditSchedule = (task: MaintenanceTask) => {
    setEditingTaskId(task.id);
    setEditForm({
      reason: task.reason,
      recommendedDate: task.recommendedDate
    });
  };

  const saveEditSchedule = async () => {
    if (!editingTaskId) return;
    const current = scheduledTasks.find((t) => t.id === editingTaskId);
    if (!current) return;

    if (!editForm.reason.trim() || !editForm.recommendedDate) {
      showToast('Alasan dan tanggal harus diisi.', 'error');
      return;
    }
    if (editForm.recommendedDate < today) {
      showToast('Tanggal tidak boleh di masa lalu.', 'error');
      return;
    }

    try {
      // Re-schedule with updated values (appends newer SCHEDULED log; latest wins for active)
      await schedulePreventiveMaintenance(
        current.itemId,
        editForm.recommendedDate,
        editForm.reason.trim(),
        current.source
      );
      setEditingTaskId(null);
      setEditForm({ reason: '', recommendedDate: '' });
      showToast('Jadwal pemeliharaan diperbarui.', 'success');
    } catch (e: any) {
      showToast('Gagal memperbarui jadwal: ' + (e?.message || e), 'error');
    }
  };

  const cancelEditSchedule = () => {
    setEditingTaskId(null);
    setEditForm({ reason: '', recommendedDate: '' });
  };

  if (!canSee('preventive_maintenance', user?.role || 'guru')) {
    return <div className="p-8">Tidak ada akses ke Pemeliharaan.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#000080] flex items-center gap-2"><Wrench /> Pemeliharaan Preventif</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Jadwalkan pemeliharaan barang secara manual atau gunakan AI untuk analisis otomatis.
          </p>
          {/* AI Provider Status Badge */}
          <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-medium ${
            aiStatus.available
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-amber-100 text-amber-700 border border-amber-200'
          }`}>
            <Zap size={11} className={aiStatus.available ? 'fill-emerald-500' : 'fill-amber-500'} />
            {aiStatus.available ? `AI: ${aiStatus.label}` : 'AI: Mode Simulasi (set API key di .env)'}
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={generateAIRecommendations}
              disabled={aiLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl flex items-center gap-2 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed font-semibold text-sm shadow-sm transition-all"
            >
              {aiLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Menganalisis...
                </>
              ) : (
                <>
                  <Sparkles size={15} /> Rekomendasi AI
                </>
              )}
            </button>
            <button
              onClick={() => setShowManualForm(true)}
              className="px-4 py-2 bg-[#000080] text-white rounded-xl flex items-center gap-2 font-semibold text-sm shadow-sm hover:bg-[#000070] transition-all"
            >
              <Calendar size={15} /> Jadwalkan Manual
            </button>
          </div>
        )}
      </div>

      {/* AI Recommendations Section - only accept/reject */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Rekomendasi dari AI</h2>
            <p className="text-xs text-slate-500">Dihasilkan otomatis. Pilih Terima untuk menjadwalkan atau Tolak jika tidak diperlukan.</p>
          </div>
          <span className="text-xs px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium">
            {aiRecommendations.length} pending
          </span>
        </div>

        {aiRecommendations.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Belum ada rekomendasi AI. Klik tombol "Minta Rekomendasi AI" di atas untuk memulai analisis.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white border-b">
                <th className="p-4 text-left">Item</th>
                <th className="p-4 text-left">Lokasi</th>
                <th className="p-4 text-left">Alasan (dari AI)</th>
                <th className="p-4 text-center">Tanggal Disarankan</th>
                <th className="p-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {aiRecommendations.map(rec => (
                <tr key={rec.id}>
                  <td className="p-4 font-medium">
                    {rec.itemName}{rec.sku ? ` (${rec.sku})` : ''}
                  </td>
                  <td className="p-4 text-slate-600">{rec.roomName}</td>
                  <td className="p-4 text-xs text-slate-600 max-w-md">{rec.reason}</td>
                  <td className="p-4 text-center font-mono text-xs">{rec.recommendedDate}</td>
                  <td className="p-4 text-center">
                    {canManage && (
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => acceptAIRecommendation(rec.id)}
                          className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700"
                        >
                          Terima & Jadwalkan
                        </button>
                        <button
                          onClick={() => rejectAIRecommendation(rec.id)}
                          className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Scheduled / Active Maintenances (includes overdue when recommendedDate < today) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b">
          <h2 className="font-bold text-lg">Jadwal Pemeliharaan Aktif</h2>
          <p className="text-xs text-slate-500">Hasil dari rekomendasi AI yang diterima + jadwal manual yang dibuat sendiri. Jadwal yang lewat tanggal ditandai Terlambat.</p>
        </div>

        {scheduledTasks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Belum ada jadwal pemeliharaan aktif.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white border-b">
                <th className="p-4 text-left">Item</th>
                <th className="p-4 text-left">Lokasi</th>
                <th className="p-4 text-left">Alasan</th>
                <th className="p-4 text-center">Tanggal</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {scheduledTasks.map((task: any) => {
                const isOverdue = !!task.isOverdue;
                return (
                  <tr key={task.id} className={isOverdue ? "bg-red-50/40" : ""}>
                    <td className="p-4 font-medium">{task.itemName}{task.sku ? ` (${task.sku})` : ''}</td>
                    <td className="p-4 text-slate-600">{task.roomName}</td>
                    <td className="p-4 text-xs text-slate-600 max-w-xs">{task.reason}</td>
                    <td className="p-4 text-center font-mono text-xs">{task.recommendedDate}</td>
                    <td className="p-4 text-center">
                      {isOverdue ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Terlambat</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">Aktif</span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {canManage && (
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => startEditSchedule(task)}
                            className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => markComplete(task)}
                            className="px-3 py-1 text-xs bg-[#000080] text-white rounded hover:bg-[#000060]"
                          >
                            Tandai Selesai
                          </button>
                          <button
                            onClick={() => openCancelModal(task.id)}
                            className="px-3 py-1 text-xs border border-amber-300 text-amber-600 rounded hover:bg-amber-50"
                          >
                            Batalkan
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Riwayat Pemeliharaan (completed + cancelled) - fulfills history requirement */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b">
          <h2 className="font-bold text-lg">Riwayat Pemeliharaan</h2>
          <p className="text-xs text-slate-500">Jadwal yang sudah diselesaikan atau dibatalkan (alasan pembatalan ditampilkan jika ada).</p>
        </div>

        {historyTasks.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            Belum ada riwayat pemeliharaan.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white border-b">
                <th className="p-4 text-left">Item</th>
                <th className="p-4 text-left">Lokasi</th>
                <th className="p-4 text-left">Alasan</th>
                <th className="p-4 text-center">Tanggal</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-left">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {historyTasks.map((task: any) => (
                <tr key={task.id}>
                  <td className="p-4 font-medium">{task.itemName}{task.sku ? ` (${task.sku})` : ''}</td>
                  <td className="p-4 text-slate-600">{task.roomName}</td>
                  <td className="p-4 text-xs text-slate-600 max-w-xs">{task.reason}</td>
                  <td className="p-4 text-center font-mono text-xs">{task.recommendedDate}</td>
                  <td className="p-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {task.status === 'completed' ? 'Selesai' : 'Dibatalkan'}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-600">
                    {task.cancelReason ? `Alasan: ${task.cancelReason}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual Schedule Modal */}
      {showManualForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowManualForm(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Jadwalkan Pemeliharaan Manual</h3>
            <p className="text-sm text-slate-500 mb-4">Gunakan ini jika Anda ingin menjadwalkan sendiri (bukan dari rekomendasi AI).</p>

            <div className="space-y-4">
              {/* Item Dropdown */}
              <div>
                <label className="block text-sm font-medium mb-1">Pilih Item Inventaris *</label>
                <select
                  value={manualForm.itemId}
                  onChange={e => handleManualItemSelect(e.target.value)}
                  className="w-full border rounded-lg p-2.5 bg-white"
                >
                  <option value="">-- Pilih Item --</option>
                  {allSelectableItems.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.sku ? ` (${item.sku})` : ''} — {item.roomName}
                    </option>
                  ))}
                </select>
                {manualForm.itemId && activeScheduleDueDates.has(manualForm.itemId) && (
                  <p className="text-xs text-amber-600 mt-1">
                    Item ini sudah punya jadwal aktif sampai {activeScheduleDueDates.get(manualForm.itemId)}. 
                    Tanggal baru harus lebih dari itu (atau selesaikan/batalkan jadwal lama dulu).
                  </p>
                )}
              </div>

              {/* Auto-filled info */}
              {manualForm.itemId && (
                <div className="bg-slate-50 border rounded-lg p-3 text-sm">
                  <div><span className="font-medium">Item:</span> {manualForm.itemName}{manualForm.sku ? ` (${manualForm.sku})` : ''}</div>
                  <div><span className="font-medium">Lokasi:</span> {manualForm.roomName}</div>
                  <div><span className="font-medium">Kondisi Saat Ini:</span> {manualForm.condition}</div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium mb-1">Alasan / Catatan Pemeliharaan *</label>
                <textarea
                  value={manualForm.reason}
                  onChange={e => setManualForm({ ...manualForm, reason: e.target.value })}
                  rows={3}
                  className="w-full border rounded-lg p-2.5"
                  placeholder="Contoh: Komponen menunjukkan tanda aus setelah pemakaian intensif 6 bulan terakhir."
                />
              </div>

              {/* Date - future only */}
              <div>
                <label className="block text-sm font-medium mb-1">Tanggal Pemeliharaan *</label>
                <input
                  type="date"
                  min={today}
                  value={manualForm.recommendedDate}
                  onChange={e => setManualForm({ ...manualForm, recommendedDate: e.target.value })}
                  className="w-full border rounded-lg p-2.5"
                />
                <p className="text-xs text-slate-500 mt-1">Tidak boleh memilih tanggal yang sudah lewat.</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowManualForm(false);
                  setManualForm({ itemId: '', itemName: '', roomName: '', condition: '', sku: '', reason: '', recommendedDate: '' });
                }}
                className="flex-1 py-2 border rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={submitManualSchedule}
                className="flex-1 py-2 bg-[#000080] text-white rounded-lg"
              >
                Simpan Jadwal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Active Schedule Modal */}
      {editingTaskId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={cancelEditSchedule}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Edit Jadwal Pemeliharaan</h3>
            <p className="text-sm text-slate-500 mb-4">Perbarui alasan atau tanggal untuk jadwal aktif ini.</p>

            <div className="space-y-4">
              {/* Read-only item info */}
              {(() => {
                const currentTask = scheduledTasks.find(t => t.id === editingTaskId);
                return currentTask ? (
                  <div className="bg-slate-50 border rounded-lg p-3 text-sm">
                    <div><span className="font-medium">Item:</span> {currentTask.itemName}{currentTask.sku ? ` (${currentTask.sku})` : ''}</div>
                    <div><span className="font-medium">Lokasi:</span> {currentTask.roomName}</div>
                  </div>
                ) : null;
              })()}

              {/* Reason */}
              <div>
                <label className="block text-sm font-medium mb-1">Alasan / Catatan Pemeliharaan *</label>
                <textarea
                  value={editForm.reason}
                  onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                  rows={3}
                  className="w-full border rounded-lg p-2.5"
                  placeholder="Alasan pemeliharaan..."
                />
              </div>

              {/* Date - future only */}
              <div>
                <label className="block text-sm font-medium mb-1">Tanggal Pemeliharaan *</label>
                <input
                  type="date"
                  min={today}
                  value={editForm.recommendedDate}
                  onChange={e => setEditForm({ ...editForm, recommendedDate: e.target.value })}
                  className="w-full border rounded-lg p-2.5"
                />
                <p className="text-xs text-slate-500 mt-1">Tidak boleh memilih tanggal yang sudah lewat.</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={cancelEditSchedule}
                className="flex-1 py-2 border rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={saveEditSchedule}
                className="flex-1 py-2 bg-[#000080] text-white rounded-lg"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Maintenance Modal (requires reason) */}
      {cancellingTaskId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeCancelModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-1">Batalkan Jadwal Pemeliharaan</h3>
            <p className="text-sm text-red-600 mb-4">Wajib memberikan alasan pembatalan.</p>

            {/* Task info */}
            {(() => {
              const task = scheduledTasks.find(t => t.id === cancellingTaskId);
              return task ? (
                <div className="bg-slate-50 border rounded-lg p-3 mb-4 text-sm">
                  <div><span className="font-medium">Item:</span> {task.itemName}{task.sku ? ` (${task.sku})` : ''}</div>
                  <div><span className="font-medium">Lokasi:</span> {task.roomName}</div>
                  <div><span className="font-medium">Tanggal:</span> {task.recommendedDate}</div>
                </div>
              ) : null;
            })()}

            <div>
              <label className="block text-sm font-medium mb-1">Alasan Pembatalan *</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={4}
                className="w-full border rounded-lg p-2.5"
                placeholder="Contoh: Item masih berfungsi dengan baik, pemeliharaan ditunda karena anggaran."
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeCancelModal}
                className="flex-1 py-2 border rounded-lg"
              >
                Batal
              </button>
              <button
                onClick={confirmCancelSchedule}
                disabled={!cancelReason.trim()}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Konfirmasi Batalkan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
