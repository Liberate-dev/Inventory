import { Monitor, ArrowRight, Box, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext';
import { useAuth } from '../context/AuthContext';

const LandingPage = () => {
    const navigate = useNavigate();
    const { setPortalType } = usePortal();
    const { logout, user } = useAuth();

    const isLabDisabled = user?.role === 'admin_nl' || user?.labScope === 'non-lab';
    const isNonLabDisabled = user?.role === 'kepala_lab' || user?.role === 'guru' || 
        (user?.labScope && user.labScope !== 'all' && user.labScope !== 'non-lab');

    const handleEnterPortal = (type: 'lab' | 'non-lab') => {
        if (type === 'lab' && isLabDisabled) return;
        if (type === 'non-lab' && isNonLabDisabled) return;
        setPortalType(type);
        navigate('/dashboard');
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans">
            <div className="max-w-5xl mx-auto">
                <header className="mb-10 md:mb-12 text-center relative">
                    <button
                        onClick={() => {
                            logout();
                            navigate('/login');
                        }}
                        className="absolute top-0 right-0 text-sm text-slate-500 hover:text-red-600 font-semibold px-3 py-2 inline-flex items-center gap-2"
                    >
                        <LogOut size={16} /> Keluar
                    </button>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-[#000080] tracking-tight mb-3">Portal Inventory Panderman</h1>
                    <p className="text-slate-500 text-base md:text-lg font-medium">Pilih tujuan portal untuk melanjutkan</p>
                </header>

                <div className="grid md:grid-cols-2 gap-6 md:gap-8">
                    <motion.button
                        whileHover={isLabDisabled ? {} : { scale: 1.02 }}
                        whileTap={isLabDisabled ? {} : { scale: 0.99 }}
                        className={`group text-left relative overflow-hidden bg-white rounded-2xl border transition-all ${isLabDisabled ? 'opacity-50 cursor-not-allowed border-slate-200 grayscale' : 'shadow-md border-slate-200 hover:shadow-lg cursor-pointer'}`}
                        onClick={() => handleEnterPortal('lab')}
                        disabled={isLabDisabled}
                    >
                        <div className={`absolute top-0 right-0 w-40 h-40 rounded-full -mr-20 -mt-20 blur-2xl ${isLabDisabled ? 'bg-slate-200' : 'bg-blue-900/5'}`} />
                        <div className="p-8 flex flex-col h-full relative z-10">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${isLabDisabled ? 'bg-slate-300' : 'bg-[#000080] shadow-md shadow-blue-900/10'}`}>
                                <Monitor size={28} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-extrabold text-slate-800 mb-2 tracking-tight">Portal Lab</h2>
                            {isLabDisabled && <span className="inline-block px-2.5 py-1 mb-3 bg-red-100 text-red-700 text-xs font-bold rounded-lg self-start">Akses Terkunci</span>}
                            <p className="text-slate-500 mb-8 flex-grow font-medium">
                                Kelola aset komputer, perangkat, dan penempatan item untuk seluruh area laboratorium.
                            </p>
                            <div className={`inline-flex items-center font-bold text-sm uppercase tracking-wide transition-all ${isLabDisabled ? 'text-slate-400 gap-2' : 'text-[#000080] group-hover:gap-3 gap-2'}`}>
                                Masuk Portal Lab <ArrowRight size={18} />
                            </div>
                        </div>
                    </motion.button>

                    <motion.button
                        whileHover={isNonLabDisabled ? {} : { scale: 1.02 }}
                        whileTap={isNonLabDisabled ? {} : { scale: 0.99 }}
                        className={`group text-left relative overflow-hidden bg-white rounded-2xl border transition-all ${isNonLabDisabled ? 'opacity-50 cursor-not-allowed border-slate-200 grayscale' : 'shadow-md border-slate-200 hover:shadow-lg cursor-pointer'}`}
                        onClick={() => handleEnterPortal('non-lab')}
                        disabled={isNonLabDisabled}
                    >
                        <div className={`absolute top-0 right-0 w-40 h-40 rounded-full -mr-20 -mt-20 blur-2xl ${isNonLabDisabled ? 'bg-slate-200' : 'bg-amber-500/10'}`} />
                        <div className="p-8 flex flex-col h-full relative z-10">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${isNonLabDisabled ? 'bg-slate-300' : 'bg-amber-500 shadow-md shadow-amber-900/10'}`}>
                                <Box size={28} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-extrabold text-slate-800 mb-2 tracking-tight">Portal Non-Lab</h2>
                            {isNonLabDisabled && <span className="inline-block px-2.5 py-1 mb-3 bg-red-100 text-red-700 text-xs font-bold rounded-lg self-start">Akses Terkunci</span>}
                            <p className="text-slate-500 mb-8 flex-grow font-medium">
                                Manajemen inventaris umum untuk ruang kelas, kantor, gudang, dan ruang operasional lainnya.
                            </p>
                            <div className={`inline-flex items-center font-bold text-sm uppercase tracking-wide transition-all ${isNonLabDisabled ? 'text-slate-400 gap-2' : 'text-amber-600 group-hover:gap-3 gap-2'}`}>
                                Masuk Portal Non-Lab <ArrowRight size={18} />
                            </div>
                        </div>
                    </motion.button>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
