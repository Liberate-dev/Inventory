import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, User, ArrowRight, CheckCircle2, AlertCircle, Phone } from 'lucide-react';
import { motion } from 'framer-motion';

const LoginPage = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const result = await login(username, password);

        if (result.success) {
            navigate('/');
        } else {
            setError(result.error || 'Login failed');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-white">
            {/* Left Side - Visuals */}
            <div className="hidden lg:flex flex-col justify-between p-12 bg-indigo-600 relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1581093588401-fbb62a02f120?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/90 to-purple-800/90"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 text-white">
                        <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30">
                            <span className="font-bold text-xl">P</span>
                        </div>
                        <span className="font-bold text-2xl tracking-tight">Portal Inventory Panderman</span>
                    </div>
                </div>

                <div className="relative z-10 max-w-lg">
                    <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
                        Portal Inventory <span className="text-indigo-200">Panderman</span>
                    </h1>
                    <p className="text-indigo-100 text-lg mb-8">
                        A unified platform designed to streamline inventory management for both Laboratory and Non-Laboratory assets with precision and efficiency.
                    </p>

                    <div className="space-y-4">
                        <div className="flex items-center gap-3 text-white/90">
                            <CheckCircle2 className="text-emerald-400" /> <span>Real-time Asset Tracking</span>
                        </div>
                        <div className="flex items-center gap-3 text-white/90">
                            <CheckCircle2 className="text-emerald-400" /> <span>Service Request Workflow</span>
                        </div>
                        <div className="flex items-center gap-3 text-white/90">
                            <CheckCircle2 className="text-emerald-400" /> <span>Visual Room Layouts</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-indigo-200 text-sm">
                    © 2026 Portal Lab Panderman. All rights reserved.
                </div>
            </div>

            {/* Right Side - Form */}
            <div className="flex items-center justify-center p-8 bg-gray-50 lg:bg-white">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center lg:text-left">
                        <h2 className="text-3xl font-bold text-gray-900">Welcome Back</h2>
                        <p className="text-gray-500 mt-2">Please sign in to your dashboard account.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm flex items-center gap-2"
                            >
                                <AlertCircle size={18} /> {error}
                            </motion.div>
                        )}

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Username</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    placeholder="Enter your username"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                                    placeholder="Enter your password"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <input id="remember-me" type="checkbox" className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">Remember me</label>
                            </div>

                            <a
                                href="https://wa.me/6283854015888?text=I%20forgot%20my%20Inventory%20Lab%20password"
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 flex items-center gap-1"
                            >
                                <Phone size={14} /> Forgot password?
                            </a>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Signing In...' : 'Sign In to Dashboard'}
                            {!isLoading && <ArrowRight size={20} />}
                        </button>
                    </form>

                    <div className="text-center text-xs text-gray-400 mt-6">
                        For demo access use: admin / admin
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
