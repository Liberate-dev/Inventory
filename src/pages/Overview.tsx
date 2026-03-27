import { useNavigate } from 'react-router-dom';
import { useState, type ComponentType } from 'react';
import {
    LayoutDashboard,
    AlertTriangle,
    Activity,
    Clock,
    FileText,
    Package,
} from 'lucide-react';
import {
    ResponsiveContainer,
    Tooltip,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
} from 'recharts';
import { useInventory } from '../context/InventoryContext';
import { useLanguage } from '../context/LanguageContext';
import { usePortal } from '../context/PortalContext';
import { useServiceRequests } from '../context/ServiceRequestContext';
import { useAuth } from '../context/AuthContext';
import { ItemConditionBadge } from '../components/common/ItemConditionBadge';
import { X } from 'lucide-react';
import type { Room } from '../types';
import { calculateRoomHealthPercentage } from '../utils/roomHealth';

interface StatCardProps {
    label: string;
    value: string | number;
    icon: ComponentType<{ size?: number; className?: string }>;
    color: 'blue' | 'emerald' | 'amber' | 'red';
    subtext: string;
    onClick?: () => void;
}

const Overview = () => {
    const { rooms } = useInventory();
    const { requests } = useServiceRequests();
    const { t } = useLanguage();
    const { portalType } = usePortal();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [activeModal, setActiveModal] = useState<'rooms' | 'assets' | 'pending' | 'inprogress' | null>(null);

    // Filter rooms by labScope for restricted users
    const scopedRooms = (() => {
        if (user?.labScope && user.labScope !== 'all' && user.labScope !== 'non-lab') {
            return rooms.filter(r => r.type === user.labScope);
        }
        return rooms;
    })();

    // Compute localized recentLogs from scopedRooms only
    const scopedRecentLogs = (() => {
        const logs: { roomName: string; itemName: string; log: any }[] = [];
        scopedRooms.forEach(room => {
            room.containers?.forEach(container => {
                container.items?.forEach(item => {
                    item.logs?.forEach(l => {
                        logs.push({ roomName: room.name, itemName: item.name, log: l });
                    });
                });
            });
        });
        logs.sort((a, b) => new Date(b.log.date).getTime() - new Date(a.log.date).getTime());
        return logs.slice(0, 10);
    })();

    // Compute low-stock consumable items
    const lowStockItems = (() => {
        if (!user) return [];
        const result: { roomName: string; containerName: string; itemName: string; quantity: number; minStock: number; unit: string }[] = [];
        scopedRooms.forEach(room => {
            room.containers?.forEach(container => {
                container.items?.forEach(item => {
                    if (item.isConsumable && (item.quantity ?? 0) <= (item.minStock ?? 0)) {
                        result.push({
                            roomName: room.name,
                            containerName: container.name,
                            itemName: item.name,
                            quantity: item.quantity ?? 0,
                            minStock: item.minStock ?? 0,
                            unit: item.unit || 'Pcs',
                        });
                    }
                });
            });
        });
        return result;
    })();

    const scopedRequests = (() => {
        if (user?.role === 'admin' || user?.labScope === 'all') {
            return requests;
        }

        const allowedRoomIds = new Set(scopedRooms.map(r => r.id));
        return requests.filter(req => allowedRoomIds.has(req.roomId));
    })();

    const pendingRequests = scopedRequests.filter(r => r.status === 'pending');
    const inProgressRequests = scopedRequests.filter(r => r.status === 'accepted');

    const trendData = [
        { name: 'Jan', issues: 4 },
        { name: 'Feb', issues: 7 },
        { name: 'Mar', issues: 5 },
        { name: 'Apr', issues: 10 },
        { name: 'May', issues: 12 },
        { name: 'Jun', issues: 8 },
    ];

    return (
        <div className="h-full flex flex-col gap-6 overflow-y-auto pr-2 pb-4 font-sans">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-[#000080] tracking-tight">{t('dashboard_title')}</h2>
                    <p className="text-slate-500 font-medium">{t('dashboard_subtitle')}</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => navigate('/dashboard/reports')}
                        className="px-4 py-2 bg-[#000080] text-white rounded-xl text-sm font-bold shadow-md shadow-blue-900/10 hover:bg-[#000060] inline-flex items-center gap-2"
                    >
                        <FileText size={16} /> {t('download_report')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label={portalType === 'lab' ? t('active_labs') : t('active_rooms')}
                    value={scopedRooms.length}
                    icon={LayoutDashboard}
                    color="blue"
                    subtext={t('total_open_rooms')}
                    onClick={() => setActiveModal('rooms')}
                />
                <StatCard
                    label={t('total_assets')}
                    value={scopedRooms.reduce((acc, r) => acc + r.containers.reduce((a, c) => a + c.items.length, 0), 0)}
                    icon={Activity}
                    color="emerald"
                    subtext={t('items_inside_all_containers')}
                    onClick={() => setActiveModal('assets')}
                />
                <StatCard
                    label={t('pending_issues')}
                    value={pendingRequests.length}
                    icon={AlertTriangle}
                    color="red"
                    subtext={t('unseen_not_accepted')}
                    onClick={() => setActiveModal('pending')}
                />
                <StatCard
                    label={t('in_progress_issues')}
                    value={inProgressRequests.length}
                    icon={Clock}
                    color="amber"
                    subtext={t('currently_being_handled')}
                    onClick={() => setActiveModal('inprogress')}
                />
            </div>

            <div className={`grid grid-cols-1 ${lowStockItems.length > 0 ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-6 min-h-[20rem]`}>
                <div className={`${lowStockItems.length > 0 ? 'lg:col-span-2' : ''} bg-white p-6 rounded-2xl border border-slate-200 shadow-md shadow-blue-900/5 flex flex-col`}>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-800 text-lg">
                            {portalType === 'lab' ? t('labs_health') : t('rooms_health')}
                        </h3>
                        <button
                            onClick={() => navigate('/dashboard/rooms')}
                            className="text-[#000080] text-sm font-semibold hover:underline"
                        >
                            {t('view_all')}
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-1">
                        {scopedRooms.map((room) => (
                            <MiniRoomCard key={room.id} room={room} t={t} />
                        ))}
                    </div>
                </div>

                {lowStockItems.length > 0 && (
                    <div className="bg-white p-6 rounded-2xl border border-rose-200 shadow-md shadow-rose-900/5 flex flex-col">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                                <AlertTriangle size={22} />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">Peringatan Stok Rendah</h3>
                                <p className="text-sm text-slate-500">{lowStockItems.length} barang di bawah batas</p>
                            </div>
                        </div>
                        <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                            {lowStockItems.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-3 bg-rose-50 border border-rose-100 rounded-xl">
                                    <div className="p-2 bg-white text-rose-500 rounded-lg shadow-sm border border-rose-100 shrink-0">
                                        <Package size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-800 truncate">{item.itemName}</p>
                                        <p className="text-xs text-slate-500 truncate">{item.roomName}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-sm font-black text-rose-600">{item.quantity}</div>
                                        <div className="text-[10px] text-slate-400">Min: {item.minStock}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md shadow-blue-900/5 h-80">
                    <h3 className="font-bold text-slate-800 text-lg mb-4">{t('maintenance_trend')}</h3>
                    <ResponsiveContainer width="100%" height="85%">
                        <AreaChart data={trendData}>
                            <defs>
                                <linearGradient id="colorIssues" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.16} />
                                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                            <Area type="monotone" dataKey="issues" stroke="#EF4444" strokeWidth={3} fillOpacity={1} fill="url(#colorIssues)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md shadow-blue-900/5 h-80 flex flex-col">
                    <h3 className="font-bold text-slate-800 text-lg mb-4">{t('recent_activity')}</h3>
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                        {scopedRecentLogs.length === 0 ? (
                            <div className="text-center text-slate-400 py-8">{t('no_activity')}</div>
                        ) : (
                            scopedRecentLogs.slice(0, 10).map((logItem, idx) => (
                                <div
                                    key={idx}
                                    className="flex gap-3 items-start p-3 hover:bg-slate-50 rounded-lg transition-colors border-l-2 border-transparent hover:border-[#000080]"
                                >
                                    <div
                                        className={`mt-1 min-w-8 h-8 rounded-full flex items-center justify-center ${logItem.log.action.includes('Reported')
                                            ? 'bg-red-100 text-red-600'
                                            : logItem.log.action.includes('Completed')
                                                ? 'bg-emerald-100 text-emerald-600'
                                                : 'bg-blue-100 text-[#000080]'
                                            }`}
                                    >
                                        <Activity size={14} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">
                                            {logItem.log.action} - {logItem.itemName}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {logItem.roomName} • {new Date(logItem.log.date).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {
                activeModal && (
                    <div className="fixed inset-0 z-50 flex justify-center pt-[15vh] px-4">
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setActiveModal(null)} />
                        <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[75vh] flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white">
                                <h3 className="text-xl font-bold text-[#000080]">
                                    {activeModal === 'rooms' && (portalType === 'lab' ? t('active_labs') : t('active_rooms'))}
                                    {activeModal === 'assets' && t('total_assets')}
                                    {activeModal === 'pending' && t('pending_issues')}
                                    {activeModal === 'inprogress' && t('in_progress_issues')}
                                </h3>
                                <button
                                    onClick={() => setActiveModal(null)}
                                    className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-0 overflow-auto flex-1 bg-slate-50">
                                {activeModal === 'rooms' && (
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-[#000080]/5 text-slate-700 font-semibold sticky top-0 backdrop-blur-md">
                                            <tr>
                                                <th className="px-6 py-4">Nama Ruangan</th>
                                                <th className="px-6 py-4">Tipe / Kategori</th>
                                                <th className="px-6 py-4 text-right">Kapasitas</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {scopedRooms.map(room => (
                                                <tr key={room.id} className="hover:bg-white transition-colors">
                                                    <td className="px-6 py-4 font-medium text-slate-800">{room.name}</td>
                                                    <td className="px-6 py-4 text-slate-600 capitalize">{(room.customType || room.type).replace('_', ' ')} / {room.category}</td>
                                                    <td className="px-6 py-4 text-slate-600 text-right">{room.capacity}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {activeModal === 'assets' && (
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-[#000080]/5 text-slate-700 font-semibold sticky top-0 backdrop-blur-md">
                                            <tr>
                                                <th className="px-6 py-4">Nama Aset</th>
                                                <th className="px-6 py-4">Lokasi (Ruang - Wadah)</th>
                                                <th className="px-6 py-4 text-center">Kondisi</th>
                                                <th className="px-6 py-4 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {scopedRooms.flatMap(room =>
                                                room.containers?.flatMap(container =>
                                                    container.items?.map(item => (
                                                        <tr key={item.id} className="hover:bg-white transition-colors">
                                                            <td className="px-6 py-4 font-medium text-slate-800">{item.name}</td>
                                                            <td className="px-6 py-4 text-slate-600">{room.name} — {container.name}</td>
                                                            <td className="px-6 py-4 text-center">
                                                                <ItemConditionBadge condition={item.condition} className="px-3 py-1 text-xs" />
                                                            </td>
                                                            <td className="px-6 py-4 text-center capitalize">
                                                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.status === 'available' ? 'bg-emerald-100 text-emerald-700' :
                                                                    item.status === 'in_use' ? 'bg-blue-100 text-blue-700' :
                                                                        'bg-slate-100 text-slate-700'
                                                                    }`}>
                                                                    {item.status || 'available'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )
                                            )}
                                        </tbody>
                                    </table>
                                )}

                                {activeModal === 'pending' && (
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-[#000080]/5 text-slate-700 font-semibold sticky top-0 backdrop-blur-md">
                                            <tr>
                                                <th className="px-6 py-4">Aset</th>
                                                <th className="px-6 py-4">Ruangan</th>
                                                <th className="px-6 py-4">Deskripsi</th>
                                                <th className="px-6 py-4">Pelapor</th>
                                                <th className="px-6 py-4">Tanggal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {pendingRequests.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">Tidak ada masalah menunggu.</td>
                                                </tr>
                                            )}
                                            {pendingRequests.map(req => (
                                                <tr key={req.id} className="hover:bg-white transition-colors">
                                                    <td className="px-6 py-4 font-medium text-slate-800">{req.componentName}</td>
                                                    <td className="px-6 py-4 text-slate-600">{req.roomName || req.roomId}</td>
                                                    <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={req.description}>{req.description}</td>
                                                    <td className="px-6 py-4 text-slate-600">{req.requesterName || 'Sistem'}</td>
                                                    <td className="px-6 py-4 text-slate-500">{new Date(req.requestDate).toLocaleDateString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {activeModal === 'inprogress' && (
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-[#000080]/5 text-slate-700 font-semibold sticky top-0 backdrop-blur-md">
                                            <tr>
                                                <th className="px-6 py-4">Aset</th>
                                                <th className="px-6 py-4">Ruangan</th>
                                                <th className="px-6 py-4">Deskripsi</th>
                                                <th className="px-6 py-4">Pelapor</th>
                                                <th className="px-6 py-4">Tanggal Permohonan</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {inProgressRequests.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">Tidak ada masalah diproses.</td>
                                                </tr>
                                            )}
                                            {inProgressRequests.map(req => (
                                                <tr key={req.id} className="hover:bg-white transition-colors">
                                                    <td className="px-6 py-4 font-medium text-slate-800">{req.componentName}</td>
                                                    <td className="px-6 py-4 text-slate-600">{req.roomName || req.roomId}</td>
                                                    <td className="px-6 py-4 text-slate-600 max-w-xs truncate" title={req.description}>{req.description}</td>
                                                    <td className="px-6 py-4 text-slate-600">{req.requesterName || 'Sistem'}</td>
                                                    <td className="px-6 py-4 text-slate-500">{new Date(req.requestDate).toLocaleDateString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

const StatCard = ({ label, value, icon: Icon, color, subtext, onClick }: StatCardProps) => {
    const colorStyles = {
        blue: 'bg-blue-400/20 text-blue-100',
        emerald: 'bg-emerald-400/20 text-emerald-300',
        amber: 'bg-amber-400/20 text-amber-300',
        red: 'bg-red-400/20 text-red-300',
    };

    return (
        <div
            onClick={onClick}
            className={`bg-[#000080] p-5 rounded-2xl border border-[#000060] shadow-md shadow-blue-900/20 flex flex-col justify-between h-32 relative overflow-hidden group hover:shadow-lg hover:shadow-blue-900/40 transition-all ${onClick ? 'cursor-pointer transform hover:-translate-y-1' : ''}`}
        >
            <div className="flex justify-between items-start z-10">
                <div>
                    <p className="text-sm font-bold text-blue-200 mb-1 uppercase tracking-wide">{label}</p>
                    <h4 className="text-3xl font-black text-white tracking-tight">{value}</h4>
                </div>
                <div className={`p-2 rounded-lg ${colorStyles[color]}`}>
                    <Icon size={20} />
                </div>
            </div>
            <p className={`text-xs font-semibold z-10 ${color === 'red' ? 'text-red-300' : 'text-blue-200'}`}>
                {subtext}
            </p>
            <Icon size={80} className="absolute -bottom-4 -right-4 text-white opacity-5 group-hover:scale-110 transition-transform" />
        </div>
    );
};

const MiniRoomCard = ({ room, t }: { room: Room; t: (key: string) => string }) => {
    const navigate = useNavigate();

    let total = 0;
    room.containers?.forEach((c) => {
        c.items?.forEach(() => {
            total++;
        });
    });

    const percentage = calculateRoomHealthPercentage(room);
    const healthColor = percentage >= 90 ? 'bg-emerald-500' : percentage >= 70 ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div
            onClick={() => navigate(`/dashboard/rooms/${room.id}`)}
            className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between"
        >
            <div>
                <h5 className="font-bold text-slate-800 text-sm">{room.name}</h5>
                <p className="text-xs text-slate-500">
                    {total} {t('assets_count')} • {room.capacity} {t('capacity')}
                </p>
            </div>
            <div className="flex flex-col items-end gap-1 w-24">
                <span className="text-xs font-bold text-slate-700">{percentage}%</span>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${healthColor}`} style={{ width: `${percentage}%` }} />
                </div>
            </div>
        </div>
    );
};

export default Overview;
