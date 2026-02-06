import { LayoutDashboard, Map, LogOut, Package, AlertTriangle, User, FileText, Shield, ClipboardList } from 'lucide-react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useEffect } from 'react';

const DashboardLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { t, language, toggleLanguage } = useLanguage();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navItems = [
        { icon: LayoutDashboard, label: t('overview'), path: '/dashboard', roles: ['all'] },
        { icon: Map, label: t('lab_rooms'), path: '/dashboard/rooms', roles: ['admin', 'kepala_lab', 'guru'] },
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

    return (
        <div className="min-h-screen bg-gray-50 flex font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full z-10 print:hidden">
                <div className="p-6 border-b border-gray-100">
                    <h1 className="text-xl font-bold flex items-center gap-2 text-slate-900">
                        <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm">P</span>
                        Portal Inventory
                    </h1>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {filteredNavItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/dashboard'}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                                }`
                            }
                        >
                            <item.icon size={20} />
                            <span className="font-medium">{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="p-4 border-t border-gray-100">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 w-full text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
                    >
                        <LogOut size={20} />
                        <span className="font-medium">Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 p-8 h-screen overflow-hidden flex flex-col print:ml-0 print:p-0 print:h-auto print:overflow-visible">
                <header className="mb-8 flex justify-between items-center flex-shrink-0 print:hidden">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">{pageTitle}</h2>
                        <div className="flex items-center gap-4 text-gray-500">
                            <p>{t('welcome_back')}, {user?.name}</p>
                            <button
                                onClick={toggleLanguage}
                                className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold shadow-sm hover:bg-gray-50 transition-colors uppercase"
                            >
                                {language === 'en' ? 'Indonesian (ID)' : 'English (EN)'}
                            </button>
                        </div>
                    </div>
                    <div className="w-10 h-10 rounded-full border-2 border-white shadow-md overflow-hidden bg-indigo-100 cursor-pointer" onClick={() => navigate('/dashboard/profile')}>
                        {user?.avatar ? (
                            <img src={user.avatar} alt="User" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-indigo-700 font-bold">
                                {user?.name.charAt(0)}
                            </div>
                        )}
                    </div>
                </header>

                <div className="flex-1 overflow-hidden animate-fade-in-up flex flex-col">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default DashboardLayout;
