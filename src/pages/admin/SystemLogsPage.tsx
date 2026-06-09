import { useEffect, useMemo, useState } from 'react';
import { Search, ScrollText } from 'lucide-react';
import { getAuthHeaders } from '../../utils/api';

type SystemLogEntry = {
    id: string;
    actorUserId?: string | null;
    actorUsername?: string | null;
    actorName?: string | null;
    actorRole?: string | null;
    actionKey: string;
    targetType?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown>;
    createdAt: string;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api').replace(/\/+$/, '');
const SYSTEM_LOGS_ENDPOINT = `${API_BASE_URL}/system_logs/logs.php`;

const prettifyAction = (value: string): string =>
    value.split('.').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' / ');

const detailsToText = (details?: Record<string, unknown>): string => {
    if (!details || Object.keys(details).length === 0) return '-';
    return Object.entries(details).map(([key, value]) => `${key}: ${String(value)}`).join(' | ');
};

const SystemLogsPage = () => {
    const [logs, setLogs] = useState<SystemLogEntry[]>([]);
    const [search, setSearch] = useState('');

    useEffect(() => {
        const loadLogs = async () => {
            const response = await fetch(`${SYSTEM_LOGS_ENDPOINT}?limit=250`, {
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

    const filteredLogs = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (needle === '') return logs;

        return logs.filter((log) =>
            log.actionKey.toLowerCase().includes(needle)
            || String(log.actorName ?? '').toLowerCase().includes(needle)
            || String(log.actorUsername ?? '').toLowerCase().includes(needle)
            || String(log.actorRole ?? '').toLowerCase().includes(needle)
            || String(log.targetType ?? '').toLowerCase().includes(needle)
            || String(log.targetId ?? '').toLowerCase().includes(needle)
            || detailsToText(log.details).toLowerCase().includes(needle)
        );
    }, [logs, search]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-3xl font-black text-slate-900">Log Sistem</h3>
                    <p className="text-slate-500 mt-2">Audit trail untuk login, manajemen pengguna, dan perubahan access matrix.</p>
                </div>
                <div className="relative w-full md:w-96">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Cari action, actor, target, atau detail..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
                    <ScrollText size={18} className="text-slate-700" />
                    <div className="font-bold text-slate-900">{filteredLogs.length} entri log</div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-xs">
                            <tr>
                                <th className="p-4 text-left">Waktu</th>
                                <th className="p-4 text-left">Action</th>
                                <th className="p-4 text-left">Actor</th>
                                <th className="p-4 text-left">Target</th>
                                <th className="p-4 text-left">Detail</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredLogs.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-10 text-center text-slate-500">Tidak ada log yang cocok.</td>
                                </tr>
                            )}
                            {filteredLogs.map((log) => (
                                <tr key={log.id} className="align-top hover:bg-slate-50">
                                    <td className="p-4 whitespace-nowrap text-slate-500">{new Date(log.createdAt).toLocaleString('id-ID')}</td>
                                    <td className="p-4 font-semibold text-slate-900">{prettifyAction(log.actionKey)}</td>
                                    <td className="p-4 text-slate-600">
                                        <div>{log.actorName || log.actorUsername || 'Sistem'}</div>
                                        <div className="text-xs text-slate-400">{log.actorRole || '-'}</div>
                                    </td>
                                    <td className="p-4 text-slate-600">
                                        {log.targetType ? `${log.targetType}${log.targetId ? ` #${log.targetId}` : ''}` : '-'}
                                    </td>
                                    <td className="p-4 text-slate-500">{detailsToText(log.details)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default SystemLogsPage;
