import { ShieldCheck, Users, ScrollText, User, LogOut } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../components/common/NotificationBell';

const AdminLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const navItems = [
        { label: 'Dashboard', path: '/admin', icon: ShieldCheck, end: true },
        { label: 'Manajemen Pengguna', path: '/admin/users', icon: Users, end: false },
        { label: 'Log Sistem', path: '/admin/system-logs', icon: ScrollText, end: false },
        { label: 'Profil Saya', path: '/admin/profile', icon: User, end: false },
    ];

    const activeItem = navItems.find((item) => item.end ? location.pathname === item.path : location.pathname.startsWith(item.path));

    return (
        <div className="min-h-screen bg-slate-50 flex">
            <aside className="w-72 shrink-0 border-r border-slate-200 bg-white p-6 flex flex-col">
                <div className="mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mb-4">
                        <ShieldCheck size={24} />
                    </div>
                    <h1 className="text-xl font-black text-slate-900">Super Admin Panel</h1>
                    <p className="text-sm text-slate-500 mt-1">Administrasi sistem pusat</p>
                </div>

                <nav className="space-y-2 flex-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.end}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-colors ${isActive
                                    ? 'bg-slate-900 text-white'
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
                            }
                        >
                            <item.icon size={18} />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="pt-6 border-t border-slate-200">
                    <div className="mb-4">
                        <div className="text-sm font-bold text-slate-900">{user?.name}</div>
                        <div className="text-xs uppercase tracking-wider text-slate-500">{user?.role}</div>
                    </div>
                    <button
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 transition-colors"
                    >
                        <LogOut size={16} />
                        Keluar
                    </button>
                </div>
            </aside>

            <main className="flex-1 min-w-0">
                <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-8 py-6">
                    <div>
                        <div className="text-sm font-semibold text-slate-500">Super Admin</div>
                        <h2 className="mt-1 text-2xl font-black text-slate-900">{activeItem?.label || 'Dashboard'}</h2>
                    </div>
                    <NotificationBell />
                </header>
                <div className="p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
