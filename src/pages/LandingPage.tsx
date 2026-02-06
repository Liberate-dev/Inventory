import { Monitor, FlaskConical, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
            <div className="max-w-4xl w-full">
                <header className="mb-12 text-center">
                    <h1 className="text-4xl font-bold text-navy-900 mb-4">Portal Inventory Panderman</h1>
                    <p className="text-gray-600 text-lg">Select your destination to proceed</p>
                </header>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Lab Portal Card */}
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="group relative overflow-hidden bg-white rounded-2xl shadow-xl cursor-pointer border border-transparent hover:border-navy-900 transition-colors"
                        onClick={() => navigate('/dashboard')}
                    >
                        <div className="absolute inset-0 bg-navy-900 opacity-0 group-hover:opacity-5 transition-opacity" />
                        <div className="p-8 flex flex-col items-center text-center h-full">
                            <div className="w-20 h-20 bg-navy-50 rounded-full flex items-center justify-center mb-6 group-hover:bg-navy-900 group-hover:text-white transition-colors">
                                <Monitor size={40} className="text-navy-900 group-hover:text-white transition-colors" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-3">Lab Portal</h2>
                            <p className="text-gray-600 mb-8 flex-grow">
                                Manage computers, equipment, and room configurations over 3 interactive labs.
                            </p>
                            <div className="flex items-center text-navy-900 font-semibold group-hover:translate-x-1 transition-transform">
                                Enter Dashboard <ArrowRight className="ml-2" size={20} />
                            </div>
                        </div>
                    </motion.div>

                    {/* Non-Lab Portal Card */}
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="group relative overflow-hidden bg-white rounded-2xl shadow-xl cursor-not-allowed opacity-75 grayscale hover:grayscale-0 transition-all"
                    >
                        <div className="p-8 flex flex-col items-center text-center h-full">
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                                <FlaskConical size={40} className="text-gray-500" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 mb-3">Non-Lab Portal</h2>
                            <p className="text-gray-600 mb-8 flex-grow">
                                General inventory management for office supplies and non-technical equipment.
                            </p>
                            <div className="flex items-center text-gray-400 font-semibold">
                                Coming Soon
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default LandingPage;
