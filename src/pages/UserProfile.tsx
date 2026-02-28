import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Mail, Shield, Camera, Save, Clock } from 'lucide-react';
import { motion } from 'framer-motion';

const UserProfile = () => {
    const { user, updateProfile } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');

    if (!user) return null;

    const handleSave = async () => {
        try {
            await updateProfile({ name, email });
            setIsEditing(false);
        } catch (error) {
            console.error('Failed to update profile:', error);
            alert(error instanceof Error ? error.message : 'Gagal memperbarui profil.');
        }
    };

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Check file type
        if (!file.type.startsWith('image/')) {
            alert('File harus berupa gambar.');
            return;
        }

        // Check file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            alert('Ukuran gambar maksimal 2MB.');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
            const dataUrl = reader.result as string;
            setIsUploading(true);
            try {
                await updateProfile({ avatar: dataUrl });
                alert('Foto profil berhasil diperbarui!');
            } catch (error) {
                console.error('Failed to update avatar:', error);
                alert(error instanceof Error ? error.message : 'Gagal memperbarui foto profil.');
            } finally {
                setIsUploading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-gray-900">Profil Saya</h2>
                <p className="text-gray-500">Kelola pengaturan profil dan preferensi akun Anda.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Profile Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="md:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center text-center h-fit"
                >
                    <div
                        className="relative mb-4 group cursor-pointer"
                        onClick={() => !isUploading && fileInputRef.current?.click()}
                    >
                        <img
                            src={user.avatar}
                            alt={user.name}
                            className={`w-32 h-32 rounded-full border-4 border-indigo-50 shadow-inner object-cover ${isUploading ? 'opacity-50' : ''}`}
                        />
                        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="text-white" />
                        </div>
                        {isUploading && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-white text-xs font-bold drop-shadow-md">Mengunggah...</span>
                            </div>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleImageUpload}
                            accept="image/*"
                            className="hidden"
                        />
                    </div>

                    <h3 className="text-xl font-bold text-gray-900">{user.name}</h3>
                    <p className="text-sm text-gray-500 mb-4">{user.email}</p>

                    <div className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
                        Akun {user.role}
                    </div>

                    <div className="w-full pt-6 border-t border-gray-100 grid grid-cols-2 gap-4 text-center">
                        <div>
                            <div className="text-2xl font-bold text-gray-900">24</div>
                            <div className="text-xs text-gray-400 font-medium uppercase">Login</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-gray-900">12</div>
                            <div className="text-xs text-gray-400 font-medium uppercase">Aksi</div>
                        </div>
                    </div>
                </motion.div>

                {/* Edit Form & Activity */}
                <div className="md:col-span-2 space-y-6">
                    {/* Settings Form */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="text-lg font-bold text-gray-800">Detail Akun</h4>
                            <button
                                onClick={() => {
                                    if (isEditing) {
                                        void handleSave();
                                        return;
                                    }
                                    setIsEditing(true);
                                }}
                                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 ${isEditing
                                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                    }`}
                            >
                                {isEditing ? <><Save size={16} /> Simpan Perubahan</> : 'Edit Profil'}
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        disabled={!isEditing}
                                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none disabled:text-gray-500 disabled:bg-gray-100/50"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        disabled={!isEditing}
                                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none disabled:text-gray-500 disabled:bg-gray-100/50"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Peran / Jabatan</label>
                                <div className="relative">
                                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        value={user.role}
                                        disabled
                                        className="w-full pl-10 pr-4 py-2 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 capitalize cursor-not-allowed"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                        <h4 className="text-lg font-bold text-gray-800 mb-4">Aktivitas Sesi Terakhir</h4>
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-full h-fit">
                                        <Clock size={16} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">Sesi Dimulai</p>
                                        <p className="text-xs text-gray-500">Masuk dari sistem perangkat</p>
                                    </div>
                                    <div className="ml-auto text-xs text-gray-400">
                                        {i === 1 ? 'Baru saja' : `${i * 2} jam yang lalu`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserProfile;
