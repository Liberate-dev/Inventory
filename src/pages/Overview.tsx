import { useInventory } from '../context/InventoryContext';
import { useLanguage } from '../context/LanguageContext';
import {
    LayoutDashboard,
    AlertTriangle,
    Activity,
    Clock,
} from 'lucide-react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
    AreaChart, Area, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { useNavigate } from 'react-router-dom';

const COLORS = ['#10B981', '#F59E0B', '#EF4444']; // Emerald, Amber, Red

const Overview = () => {
    const { stats, recentLogs, rooms } = useInventory();
    const { t } = useLanguage();
    const navigate = useNavigate();

    // Mock Trend Data (replace with real history if available)
    const trendData = [
        { name: 'Jan', issues: 4 },
        { name: 'Feb', issues: 7 },
        { name: 'Mar', issues: 5 },
        { name: 'Apr', issues: 10 },
        { name: 'May', issues: 12 },
        { name: 'Jun', issues: 8 },
    ];

    const distributionData = [
        { name: t('good'), value: stats.health.good },
        { name: t('service'), value: stats.health.service },
        { name: t('damaged'), value: stats.health.damaged },
    ].filter(item => item.value > 0);

    // If no data, show placeholder
    const chartData = distributionData.length > 0 ? distributionData : [{ name: t('no_assets'), value: 1 }];
    const chartColors = distributionData.length > 0 ? COLORS : ['#E5E7EB'];

    return (
        <div className="h-full flex flex-col gap-6 overflow-y-auto pr-2 pb-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">{t('dashboard_title')}</h2>
                    <p className="text-slate-500 text-sm">{t('dashboard_subtitle')}</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-white border border-gray-200 text-slate-600 rounded-lg text-sm font-medium shadow-sm hover:bg-gray-50 flex items-center gap-2">
                        <Clock size={16} /> {t('last_30_days')}
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium shadow-sm hover:bg-blue-700 flex items-center gap-2">
                        {t('download_report')}
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    label={t('total_assets')}
                    value={stats.totalAssets}
                    icon={LayoutDashboard}
                    color="blue"
                    subtext={`${stats.totalRooms} ${t('active_labs')}`}
                />
                <StatCard
                    label={t('operational_rate')}
                    value={`${stats.grading}%`}
                    icon={Activity}
                    color="emerald"
                    subtext={t('target_95')}
                />
                <StatCard
                    label={t('active_issues')}
                    value={stats.health.damaged}
                    icon={AlertTriangle}
                    color="red"
                    subtext={t('requires_attention')}
                />
                <StatCard
                    label={t('pending_maintenance')}
                    value={stats.health.service}
                    icon={Clock}
                    color="amber"
                    subtext={t('in_progress')}
                />
            </div>

            {/* Main Content Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
                {/* Labs Health (Left - 66%) */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-800 text-lg">{t('labs_health')}</h3>
                        <button onClick={() => navigate('/dashboard/rooms')} className="text-blue-600 text-sm font-medium hover:underline">{t('view_all')}</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto">
                        {rooms.map(room => (
                            <MiniRoomCard key={room.id} room={room} t={t} />
                        ))}
                    </div>
                </div>

                {/* Distribution (Right - 33%) */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="font-bold text-slate-800 text-lg mb-4">{t('asset_condition')}</h3>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {chartData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Maintenance Trend */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-80">
                    <h3 className="font-bold text-slate-800 text-lg mb-4">{t('maintenance_trend')}</h3>
                    <ResponsiveContainer width="100%" height="85%">
                        <AreaChart data={trendData}>
                            <defs>
                                <linearGradient id="colorIssues" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Area type="monotone" dataKey="issues" stroke="#EF4444" strokeWidth={3} fillOpacity={1} fill="url(#colorIssues)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Recent Logs */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-80 flex flex-col">
                    <h3 className="font-bold text-slate-800 text-lg mb-4">{t('recent_activity')}</h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                        {recentLogs.length === 0 ? (
                            <div className="text-center text-gray-400 py-8">{t('no_activity')}</div>
                        ) : (
                            recentLogs.map((logItem, idx) => (
                                <div key={idx} className="flex gap-3 items-start p-3 hover:bg-slate-50 rounded-lg transition-colors border-l-2 border-transparent hover:border-blue-500">
                                    <div className={`mt-1 min-w-[32px] h-8 rounded-full flex items-center justify-center ${logItem.log.action.includes('Reported') ? 'bg-red-100 text-red-600' :
                                        logItem.log.action.includes('Completed') ? 'bg-emerald-100 text-emerald-600' :
                                            'bg-blue-100 text-blue-600'
                                        }`}>
                                        <Activity size={14} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-slate-800">{logItem.log.action} - {logItem.itemName}</p>
                                        <p className="text-xs text-slate-500">{logItem.roomName} • {new Date(logItem.log.date).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Components

const StatCard = ({ label, value, icon: Icon, color, subtext }: any) => {
    const colorStyles = {
        blue: 'bg-blue-50 text-blue-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600',
        red: 'bg-red-50 text-red-600',
    };

    return (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between h-32 relative overflow-hidden group hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start z-10">
                <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
                    <h4 className="text-3xl font-bold text-slate-900">{value}</h4>
                </div>
                <div className={`p-2 rounded-lg ${colorStyles[color as keyof typeof colorStyles]}`}>
                    <Icon size={20} />
                </div>
            </div>
            <p className={`text-xs font-medium z-10 ${color === 'red' ? 'text-red-500' : 'text-slate-400'
                }`}>
                {subtext}
            </p>
            {/* Background decoration */}
            <Icon size={80} className="absolute -bottom-4 -right-4 text-slate-50 opacity-[0.05] group-hover:scale-110 transition-transform" />
        </div>
    );
};

const MiniRoomCard = ({ room, t }: { room: any, t: any }) => {
    const navigate = useNavigate();

    // Calculate health
    let total = 0;
    let good = 0;
    room.containers?.forEach((c: any) => {
        c.items?.forEach((i: any) => {
            total++;
            if (i.status === 'good') good++;
        });
    });

    const percentage = total > 0 ? Math.round((good / total) * 100) : 100;
    const healthColor = percentage >= 90 ? 'bg-emerald-500' : percentage >= 70 ? 'bg-amber-500' : 'bg-red-500';

    return (
        <div
            onClick={() => navigate(`/dashboard/rooms/${room.id}`)}
            className="p-4 border border-gray-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors flex items-center justify-between"
        >
            <div>
                <h5 className="font-bold text-slate-800 text-sm">{room.name}</h5>
                <p className="text-xs text-slate-500">{total} {t('assets_count')} • {room.capacity} {t('capacity')}</p>
            </div>
            <div className="flex flex-col items-end gap-1 w-24">
                <span className="text-xs font-bold text-slate-700">{percentage}%</span>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full ${healthColor}`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>
        </div>
    );
};

export default Overview;
