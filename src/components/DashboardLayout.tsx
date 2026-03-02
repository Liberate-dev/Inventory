import { useEffect, useState } from 'react';
import { LayoutDashboard, Map, LogOut, AlertTriangle, User, Shield, ClipboardList, Menu, X, ArrowLeft, Printer } from 'lucide-react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePortal } from '../context/PortalContext';
import { useAccessMatrix } from '../context/AccessMatrixContext';
import type { FeatureKey } from '../context/AccessMatrixContext';
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

    const { canSee } = useAccessMatrix();

    // Feature key → nav item mapping
    const allNavItems = [
        { icon: LayoutDashboard, label: t('dashboard'), path: '/dashboard', feature: 'dashboard' as FeatureKey },
        { icon: Map, label: portalType === 'lab' ? t('lab_rooms') : 'Ruangan', path: '/dashboard/rooms', feature: 'rooms' as FeatureKey },
        { icon: AlertTriangle, label: t('service_requests'), path: '/dashboard/service-requests', feature: 'service_requests' as FeatureKey },
        { icon: ClipboardList, label: t('operations'), path: '/dashboard/operations', feature: 'operations' as FeatureKey },
        { icon: Printer, label: t('print_assets'), path: '/dashboard/print-assets', feature: 'print_assets' as FeatureKey },
        { icon: Shield, label: t('user_management'), path: '/dashboard/admin/users', feature: 'user_management' as FeatureKey },
        { icon: User, label: t('my_profile'), path: '/dashboard/profile', feature: null },
    ];

    const filteredNavItems = allNavItems.filter(item =>
        item.feature === null || (user != null && canSee(item.feature, user.role))
    );

    // Determine current page title
    const activeItem = allNavItems.find(item => {
        if (item.path === '/dashboard') return location.pathname === '/dashboard';
        return location.pathname.startsWith(item.path);
    });

    const pageTitle = location.pathname.startsWith('/dashboard/reports')
        ? t('monthly_report')
        : (activeItem ? activeItem.label : t('dashboard'));

    // Update document title
    useEffect(() => {
        document.title = `Portal Inventory - ${pageTitle}`;
    }, [pageTitle]);

    const [mobileOpen, setMobileOpen] = useState(false);
    const portalTitle = portalType === 'lab' ? 'PORTAL INVENTORY LAB' : 'PORTAL INVENTORY NON LAB';

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
                className={`fixed left-0 top-0 h-screen w-64 bg-slate-50 flex flex-col z-50 transition-transform duration-300 print:hidden lg:translate-x-0 border-r border-slate-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Section 1: Logo & Name (Matches Main Page Color) */}
                <div className="p-6 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-4">
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
                                <h1 className="text-sm font-extrabold text-[#000080] tracking-widest uppercase">INVENTORY</h1>
                                <p className="text-[10px] font-medium text-slate-500">SMPK SANTA MARIA 2</p>
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

                {/* Section 2: Main Navigation */}
                <nav className="flex-1 flex flex-col justify-start px-8 py-10 space-y-8 overflow-y-auto bg-slate-50">
                    {filteredNavItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/dashboard'}
                            onClick={() => setMobileOpen(false)}
                            className={({ isActive }) =>
                                `flex items-center gap-5 text-[15px] font-bold transition-all duration-300 w-full ${isActive
                                    ? 'text-[#000080] drop-shadow-[0_0_12px_rgba(0,0,128,0.5)] scale-105'
                                    : 'text-slate-500 hover:text-[#000080] hover:drop-shadow-[0_0_10px_rgba(0,0,128,0.3)]'
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5 shrink-0" />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Section 3: Profile & Logout Actions (Matches Main Page Color) */}
                <div className="p-6 bg-slate-50 border-t border-slate-200">
                    <button
                        onClick={() => navigate('/dashboard/profile')}
                        className="w-full flex items-center gap-4 mb-6 px-2 text-left group"
                    >
                        {user?.avatar && user.avatar.length > 100 ? (
                            <img
                                src={user.avatar}
                                alt={user.name}
                                className="w-10 h-10 rounded-full object-cover shadow-sm shadow-blue-900/10 border-2 border-slate-200 group-hover:border-indigo-400 transition-colors"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-[#000080] flex items-center justify-center text-sm font-bold text-white shadow-sm shadow-blue-900/10 group-hover:bg-[#000060] transition-colors">
                                {user?.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{user?.name}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{user?.role || 'USER'}</p>
                        </div>
                    </button>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => {
                                navigate('/');
                                setMobileOpen(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-[#000080] hover:border-blue-200 rounded-xl transition-colors shadow-sm text-xs font-semibold"
                        >
                            <ArrowLeft size={16} />
                            <span>Kembali Portal</span>
                        </button>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-2.5 bg-white border border-red-100 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-xl transition-colors shadow-sm text-xs font-semibold"
                        >
                            <LogOut size={16} />
                            <span>Keluar</span>
                        </button>
                    </div>
                </div>
            </aside>

            <main className="flex-1 lg:ml-64 h-screen overflow-hidden flex flex-col print:ml-0 print:h-auto print:overflow-visible bg-slate-50">
                {/* Header with Bottom Border Separator */}
                <header className="p-6 md:p-8 border-b border-slate-200 bg-slate-50 pt-16 lg:pt-8 flex flex-col md:flex-row justify-between items-start md:items-center flex-shrink-0 print:hidden gap-4">
                    <div>
                        <h1 className="text-2xl font-extrabold text-[#000080] tracking-tight leading-tight">
                            {portalTitle}
                        </h1>
                        <h2 className="text-lg font-bold text-slate-600">SMPK SANTA MARIA 2 MALANG</h2>
                    </div>

                    <div className="text-sm font-semibold text-slate-500">
                        {pageTitle}
                    </div>
                </header>

                <div className="flex-1 p-6 md:p-8 overflow-y-auto overflow-x-hidden p-1 flex flex-col bg-slate-50">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
