import { Monitor, ArrowRight, Box, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { usePortal } from '../context/PortalContext';
import { useAuth } from '../context/AuthContext';

const LandingPage = () => {
    const navigate = useNavigate();
    const { setPortalType } = usePortal();
    const { logout } = useAuth();

    const handleEnterPortal = (type: 'lab' | 'non-lab') => {
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
                        <LogOut size={16} /> Logout
                    </button>
                    <h1 className="text-3xl md:text-4xl font-extrabold text-[#000080] tracking-tight mb-3">Portal Inventory Panderman</h1>
                    <p className="text-slate-500 text-base md:text-lg font-medium">Pilih tujuan portal untuk melanjutkan</p>
                </header>

                <div className="grid md:grid-cols-2 gap-6 md:gap-8">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.99 }}
                        className="group text-left relative overflow-hidden bg-white rounded-2xl shadow-md border border-slate-200 hover:shadow-lg transition-all"
                        onClick={() => handleEnterPortal('lab')}
                    >
                        <div className="absolute top-0 right-0 w-40 h-40 bg-blue-900/5 rounded-full -mr-20 -mt-20 blur-2xl" />
                        <div className="p-8 flex flex-col h-full">
                            <div className="w-14 h-14 bg-[#000080] rounded-xl flex items-center justify-center mb-6 shadow-md shadow-blue-900/10">
                                <Monitor size={28} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-extrabold text-slate-800 mb-3 tracking-tight">Lab Portal</h2>
                            <p className="text-slate-500 mb-8 flex-grow font-medium">
                                Kelola aset komputer, perangkat, dan penempatan item untuk seluruh area laboratorium.
                            </p>
                            <div className="inline-flex items-center text-[#000080] font-bold text-sm uppercase tracking-wide group-hover:gap-3 gap-2 transition-all">
                                Masuk Portal Lab <ArrowRight size={18} />
                            </div>
                        </div>
                    </motion.button>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.99 }}
                        className="group text-left relative overflow-hidden bg-white rounded-2xl shadow-md border border-slate-200 hover:shadow-lg transition-all"
                        onClick={() => handleEnterPortal('non-lab')}
                    >
                        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full -mr-20 -mt-20 blur-2xl" />
                        <div className="p-8 flex flex-col h-full">
                            <div className="w-14 h-14 bg-amber-500 rounded-xl flex items-center justify-center mb-6 shadow-md shadow-amber-900/10">
                                <Box size={28} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-extrabold text-slate-800 mb-3 tracking-tight">Non-Lab Portal</h2>
                            <p className="text-slate-500 mb-8 flex-grow font-medium">
                                Manajemen inventaris umum untuk ruang kelas, kantor, gudang, dan ruang operasional lainnya.
                            </p>
                            <div className="inline-flex items-center text-amber-600 font-bold text-sm uppercase tracking-wide group-hover:gap-3 gap-2 transition-all">
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
