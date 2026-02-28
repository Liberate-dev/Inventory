
import React, { useState } from 'react';
import { X, Check, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/public/api').replace(/\/+$/, '');
const USERS_ENDPOINT = `${API_BASE_URL}/users/users.php`;

interface VerificationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVerify: (verifierInfo: string) => void;
    title: string;
    description: string;
}

const VerificationModal: React.FC<VerificationModalProps> = ({ isOpen, onClose, onVerify, title, description }) => {
    const [verifierInfo, setVerifierInfo] = useState('');
    const [users, setUsers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { t } = useLanguage();

    React.useEffect(() => {
        if (isOpen && users.length === 0) {
            setIsLoading(true);
            fetch(USERS_ENDPOINT)
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success' && data.users) {
                        setUsers(data.users);
                    }
                })
                .catch(err => console.error("Failed to fetch users", err))
                .finally(() => setIsLoading(false));
        }
    }, [isOpen]);

    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!verifierInfo.trim()) return;

        // If users are loaded, validate against the DB
        if (users.length > 0) {
            const searchTerm = verifierInfo.toLowerCase().trim();
            const matchedUser = users.find(u =>
                (u.name && u.name.toLowerCase() === searchTerm) ||
                (u.email && u.email.toLowerCase() === searchTerm) ||
                (u.phone && u.phone.toLowerCase() === searchTerm)
            );

            if (!matchedUser) {
                setError(t('verification_error') || 'User tidak ditemukan di database. Pastikan Nama, Email, atau No HP benar.');
                return;
            }
        }

        onVerify(verifierInfo);
        setVerifierInfo('');
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-scale-in border border-slate-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-[#000080] flex items-center gap-2">
                        <ShieldCheck size={24} className="text-[#000080]" />
                        {title}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-white rounded-lg transition-colors text-slate-500">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <p className="text-slate-600 mb-6">{description}</p>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            {t('verification_label') || "Verifikasi Identitas"}
                        </label>
                        <input
                            type="text"
                            value={verifierInfo}
                            onChange={(e) => {
                                setVerifierInfo(e.target.value);
                                setError('');
                            }}
                            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 transition-all outline-none ${error ? 'border-red-400 focus:ring-red-500 focus:border-red-500 bg-red-50' : 'border-slate-200 focus:ring-[#000080] focus:border-[#000080]'}`}
                            placeholder={t('verification_placeholder') || "Contoh: Budi / 08123456789"}
                            autoFocus
                            required
                        />
                        {error && (
                            <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                                {error}
                            </p>
                        )}
                        {isLoading && (
                            <p className="mt-2 text-xs text-slate-500 animate-pulse">
                                Memuat database user...
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3 justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            {t('btn_cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={!verifierInfo.trim()}
                            className="px-5 py-2.5 bg-[#000080] text-white font-medium hover:bg-[#000060] rounded-xl shadow-md shadow-blue-900/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Check size={18} />
                            {t('btn_verify') || "Verifikasi"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default VerificationModal;
