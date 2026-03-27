import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, Loader2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import logo from '../assets/logo.png';

const LoginPage = () => {
    const navigate = useNavigate();
    const { login } = useAuth();

    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const result = await login(identifier, password);

        if (result.success) {
            navigate(result.redirectPath || '/');
        } else {
            setError(result.error || 'Login gagal');
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 relative overflow-hidden font-sans">
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-blue-900/5 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-blue-900/5 rounded-full blur-3xl" />

            <div className="w-full max-w-md border border-slate-200 bg-white shadow-xl shadow-blue-900/5 rounded-2xl relative z-10 transition-all duration-300">
                <div className="text-center space-y-4 px-6 pt-8 pb-4">
                    <div className="mx-auto w-16 h-16 bg-[#000080] rounded-2xl flex items-center justify-center shadow-lg shadow-blue-900/20">
                        <img
                            src={logo}
                            alt="Logo"
                            className="w-8 h-8 object-contain"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                        <GraduationCap className="w-8 h-8 text-white hidden" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-extrabold text-[#000080] tracking-tight">Portal Inventory</h1>
                        <p className="text-slate-500 font-medium text-sm">Masuk ke akun Anda untuk melanjutkan</p>
                    </div>
                </div>

                <div className="px-6 pb-7 pt-2">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium text-center flex items-center justify-center gap-2">
                                <AlertCircle className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label htmlFor="identifier" className="text-slate-700 text-sm font-semibold ml-1 block">
                                Nama Pengguna / Email
                            </label>
                            <input
                                id="identifier"
                                type="text"
                                placeholder="admin"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                required
                                className="w-full bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#000080] focus:ring-[#000080]/10 h-12 rounded-xl px-4"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="password" className="text-slate-700 text-sm font-semibold ml-1 block">
                                Kata Sandi
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="********"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="w-full bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-[#000080] focus:ring-[#000080]/10 h-12 rounded-xl pl-4 pr-11"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                                    aria-label="Toggle password visibility"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 bg-[#000080] hover:bg-[#000060] text-white font-bold rounded-xl shadow-lg shadow-blue-900/10 transition-all duration-300 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Sedang Masuk...
                                </>
                            ) : (
                                'Masuk ke Sistem'
                            )}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <p className="text-xs text-slate-400 text-center font-medium mb-2 uppercase tracking-wider">
                            Akun Demo
                        </p>
                        <p className="text-center text-xs text-slate-500">admin / password</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
