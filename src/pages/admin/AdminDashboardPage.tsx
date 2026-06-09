import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Users, UserCheck, ScrollText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getAuthHeaders } from '../../utils/api';

type SystemLogEntry = {
    id: string;
    actorName?: string | null;
    actorUsername?: string | null;
    actorRole?: string | null;
    actionKey: string;
    targetType?: string | null;
    targetId?: string | null;
    createdAt: string;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api').replace(/\/+$/, '');
const SYSTEM_LOGS_ENDPOINT = `${API_BASE_URL}/system_logs/logs.php`;

const formatActionLabel = (value: string): string =>
    value.split('.').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' / ');

const AdminDashboardPage = () => {
    const { allUsers } = useAuth();
    const [logs, setLogs] = useState<SystemLogEntry[]>([]);

    useEffect(() => {
        const loadLogs = async () => {
            const response = await fetch(`${SYSTEM_LOGS_ENDPOINT}?limit=8`, {
                headers: getAuthHeaders()
            });
            const payload = await response.json().catch(() => ({})) as { status?: string; logs?: SystemLogEntry[] };
            if (!response.ok || payload.status === 'error' || !Array.isArray(payload.logs)) {
                setLogs([]);
                return;
            }
            setLogs(payload.logs);
        };

        void loadLogs().catch(() => setLogs([]));
    }, []);

    const roleSummary = useMemo(() => {
        const counts = {
            total: allUsers.length,
            admins: allUsers.filter((user) => user.role === 'admin').length,
            nonAdmins: allUsers.filter((user) => user.role !== 'admin').length,
        };
        return counts;
    }, [allUsers]);

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-3xl font-black text-slate-900">Panel Super Admin</h3>
                <p className="text-slate-500 mt-2">Kontrol administratif pusat tanpa akses ke portal inventory operasional.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-4">
                        <Users size={22} />
                    </div>
                    <div className="text-sm font-semibold text-slate-500">Total Pengguna</div>
                    <div className="text-3xl font-black text-slate-900 mt-2">{roleSummary.total}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-4">
                        <ShieldCheck size={22} />
                    </div>
                    <div className="text-sm font-semibold text-slate-500">Akun Super Admin</div>
                    <div className="text-3xl font-black text-slate-900 mt-2">{roleSummary.admins}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-6">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-4">
                        <UserCheck size={22} />
                    </div>
                    <div className="text-sm font-semibold text-slate-500">Akun Operasional</div>
                    <div className="text-3xl font-black text-slate-900 mt-2">{roleSummary.nonAdmins}</div>
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
                    <ScrollText size={18} className="text-slate-700" />
                    <div>
                        <h4 className="font-bold text-slate-900">Aktivitas Sistem Terbaru</h4>
                        <p className="text-sm text-slate-500">Event autentikasi, manajemen user, dan perubahan policy.</p>
                    </div>
                </div>
                <div className="divide-y divide-slate-100">
                    {logs.length === 0 && (
                        <div className="px-6 py-10 text-center text-slate-500">Belum ada log sistem.</div>
                    )}
                    {logs.map((log) => (
                        <div key={log.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                            <div>
                                <div className="font-semibold text-slate-900">{formatActionLabel(log.actionKey)}</div>
                                <div className="text-sm text-slate-500">
                                    {(log.actorName || log.actorUsername || 'Sistem')}
                                    {log.actorRole ? ` • ${log.actorRole}` : ''}
                                    {log.targetType ? ` • ${log.targetType}${log.targetId ? ` #${log.targetId}` : ''}` : ''}
                                </div>
                            </div>
                            <div className="text-sm text-slate-400">
                                {new Date(log.createdAt).toLocaleString('id-ID')}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminDashboardPage;
