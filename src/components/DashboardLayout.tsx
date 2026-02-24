import { useEffect, useState } from 'react';
import { LayoutDashboard, Map, LogOut, Package, AlertTriangle, User, FileText, Shield, ClipboardList, Menu, X } from 'lucide-react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePortal } from '../context/PortalContext';
import logo from '../assets/logo.png';

const DashboardLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const { portalType } = usePortal();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navItems = [
        { icon: LayoutDashboard, label: t('overview'), path: '/dashboard', roles: ['all'] },
        { icon: Map, label: portalType === 'lab' ? t('lab_rooms') : 'Rooms', path: '/dashboard/rooms', roles: ['admin', 'kepala_lab', 'guru'] },
        { icon: AlertTriangle, label: t('service_requests'), path: '/dashboard/service-requests', roles: ['admin', 'sarpras', 'kepala_lab', 'guru'] },
        { icon: ClipboardList, label: t('operations'), path: '/dashboard/operations', roles: ['admin', 'kepala_lab', 'guru'] },
        { icon: Package, label: t('assets'), path: '/dashboard/assets', roles: ['admin', 'guru', 'kepala_lab'] },
        { icon: FileText, label: t('monthly_report'), path: '/dashboard/reports', roles: ['admin', 'kepala_sekolah', 'sarpras', 'kepala_lab'] },
        { icon: Shield, label: t('user_management'), path: '/dashboard/admin/users', roles: ['admin'] },
        { icon: User, label: t('my_profile'), path: '/dashboard/profile', roles: ['all'] },
    ];

    const filteredNavItems = navItems.filter(item =>
        item.roles.includes('all') || (user && item.roles.includes(user.role))
    );

    // Determine current page title
    const activeItem = navItems.find(item => {
        if (item.path === '/dashboard') return location.pathname === '/dashboard';
        return location.pathname.startsWith(item.path);
    });

    const pageTitle = activeItem ? activeItem.label : 'Dashboard';

    // Update document title
    useEffect(() => {
        document.title = `Portal Inventory - ${pageTitle}`;
    }, [pageTitle]);

    const [mobileOpen, setMobileOpen] = useState(false);

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans">
            <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#000080] text-white shadow-lg"
                aria-label="Open menu"
            >
                <Menu className="w-5 h-5" />
            </button>

            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <aside
                className={`fixed left-0 top-0 h-screen w-64 bg-white border-r border-[#E2E8F0] flex flex-col z-50 transition-transform duration-300 print:hidden lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <div className="p-6 border-b border-[#F1F5F9]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#000080] shadow-md shadow-blue-900/10">
                                <img
                                    src={logo}
                                    alt="Logo"
                                    className="w-7 h-7 object-contain"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        ((e.target as HTMLImageElement).nextSibling as HTMLElement).style.display = 'block';
                                    }}
                                />
                                <span className="hidden text-white font-bold text-sm">P</span>
                            </div>
                            <div>
                                <h1 className="text-sm font-extrabold text-[#000080] tracking-tight">INVENTORY</h1>
                                <p className="text-[10px] font-bold text-slate-500">SMPK SANTA MARIA 2</p>
                            </div>
                        </div>

                        <button
                            onClick={() => setMobileOpen(false)}
                            className="lg:hidden text-slate-400 hover:text-slate-600"
                            aria-label="Close menu"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {filteredNavItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/dashboard'}
                            onClick={() => setMobileOpen(false)}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 border border-transparent ${isActive
                                    ? 'bg-[#000080] text-white shadow-md shadow-blue-900/10'
                                    : 'text-slate-600 hover:text-[#000080] hover:bg-slate-50 hover:border-slate-200'
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5 shrink-0" />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-[#F1F5F9] bg-slate-50/50">
                    <button
                        onClick={() => navigate('/dashboard/profile')}
                        className="w-full flex items-center gap-3 mb-3 px-2 text-left"
                    >
                        <div className="w-10 h-10 rounded-full bg-[#000080] flex items-center justify-center text-sm font-bold text-white shadow-sm">
                            {user?.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{user?.name}</p>
                            <p className="text-[10px] font-medium text-slate-500 uppercase">{user?.role || 'USER'}</p>
                        </div>
                    </button>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                    >
                        <LogOut size={18} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            <main className="flex-1 p-6 md:p-8 lg:ml-64 h-screen overflow-hidden flex flex-col print:ml-0 print:p-0 print:h-auto print:overflow-visible">
                <header className="mb-6 md:mb-8 pt-12 lg:pt-0 flex flex-col md:flex-row justify-between items-start md:items-center flex-shrink-0 print:hidden gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-[#000080] tracking-tight leading-tight">
                            PORTAL INVENTORY
                        </h1>
                        <h2 className="text-lg font-bold text-slate-600">SMPK SANTA MARIA 2 MALANG</h2>
                    </div>

                    <div className="text-sm font-semibold text-slate-500">
                        {pageTitle}
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 flex flex-col">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
