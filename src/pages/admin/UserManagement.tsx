import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { User, UserRole } from '../../types';
import { useAccessMatrix, FEATURE_LABELS } from '../../context/AccessMatrixContext';
import type { FeatureKey, AccessLevel } from '../../context/AccessMatrixContext';
import { Search, Plus, Trash2, Edit2, X, Users, ShieldCheck, Eye, ChevronDown, RotateCcw } from 'lucide-react';

// ── Role Definitions ──────────────────────────────────────────────────────────
const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string; description: string }> = {
    admin: { label: 'Super Admin', color: 'text-indigo-700', bg: 'bg-indigo-100', description: 'Akses penuh ke semua fitur, termasuk manajemen pengguna.' },
    kepala_lab: { label: 'Kepala Lab', color: 'text-emerald-700', bg: 'bg-emerald-100', description: 'Kelola inventaris lab, operasional, dan laporan.' },
    guru: { label: 'Guru / Asisten', color: 'text-blue-700', bg: 'bg-blue-100', description: 'Kelola inventaris lab dan operasional.' },
    kepala_sekolah: { label: 'Kepsek', color: 'text-amber-700', bg: 'bg-amber-100', description: 'Melihat laporan dan kondisi seluruh inventaris (read-only).' },
    sarpras: { label: 'Sarpras', color: 'text-rose-700', bg: 'bg-rose-100', description: 'Melihat permintaan layanan dan inventaris (read-only).' },
};

const ROLE_OPTIONS: UserRole[] = ['admin', 'kepala_lab', 'guru', 'kepala_sekolah', 'sarpras'];

const getRoleLabel = (role: UserRole): string => ROLE_CONFIG[role]?.label ?? role;
const getRoleColor = (role: UserRole): string => `${ROLE_CONFIG[role]?.bg ?? 'bg-slate-100'} ${ROLE_CONFIG[role]?.color ?? 'text-slate-600'}`;

// ── Access Level Config ──────────────────────────────────────────────────────
const LEVEL_CYCLE: AccessLevel[] = ['full', 'view', 'none'];
const LEVEL_CONFIG: Record<AccessLevel, { label: string; cellCls: string; icon: string }> = {
    full: { label: 'Penuh', cellCls: 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200', icon: '✓' },
    view: { label: 'View', cellCls: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200', icon: '👁' },
    none: { label: 'Tidak Ada', cellCls: 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200', icon: '—' },
};
const FEATURE_KEYS = Object.keys(FEATURE_LABELS) as FeatureKey[];

// ── Component ─────────────────────────────────────────────────────────────────
const UserManagement = () => {
    const { allUsers, deleteUser, user: currentUser } = useAuth();
    const { getAccess, setAccess, resetMatrix } = useAccessMatrix();
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [showAccessMatrix, setShowAccessMatrix] = useState(false);
    const [isEditingMatrix, setIsEditingMatrix] = useState(false);

    // ── Guard ─────────────────────────────────────────────────────────────────
    if (currentUser?.role !== 'admin') {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-[60vh]">
                <ShieldCheck size={64} className="text-red-500 mb-4 opacity-80" />
                <h2 className="text-2xl font-bold text-slate-800">Akses Ditolak</h2>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                    Halaman manajemen pengguna ini dibatasi dan hanya dapat diakses oleh Administrator Sistem.
                </p>
            </div>
        );
    }

    // ── Filter ────────────────────────────────────────────────────────────────
    const normalizedSearch = searchTerm.toLowerCase();
    const filteredUsers = allUsers.filter((u) => {
        const matchSearch =
            (u.name?.toLowerCase() ?? '').includes(normalizedSearch) ||
            (u.email?.toLowerCase() ?? '').includes(normalizedSearch) ||
            (u.username?.toLowerCase() ?? '').includes(normalizedSearch);
        const matchRole = roleFilter === 'all' || u.role === roleFilter;
        return matchSearch && matchRole;
    });

    // ── Delete ────────────────────────────────────────────────────────────────
    const handleDelete = async (id: string) => {
        if (!confirm('Apakah Anda yakin ingin menghapus pengguna ini? Tindakan ini tidak dapat dibatalkan.')) return;
        try {
            await deleteUser(id);
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert(error instanceof Error ? error.message : 'Gagal menghapus pengguna.');
        }
    };

    // ── Stats ─────────────────────────────────────────────────────────────────
    const roleCounts = ROLE_OPTIONS.reduce((acc, role) => {
        acc[role] = allUsers.filter(u => u.role === role).length;
        return acc;
    }, {} as Record<UserRole, number>);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-extrabold text-[#000080] tracking-tight">Manajemen Pengguna</h2>
                    <p className="text-slate-500 text-sm">Kelola akses sistem, peran, dan hak pengguna.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowAccessMatrix(!showAccessMatrix)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all text-sm"
                    >
                        <Eye size={18} />
                        Matriks Akses
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#000080] text-white rounded-xl font-bold shadow-md shadow-blue-900/10 hover:bg-[#000060] transition-all text-sm"
                    >
                        <Plus size={18} />
                        Tambah Pengguna
                    </button>
                </div>
            </div>

            {/* Access Matrix Panel */}
            {showAccessMatrix && (
                <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={20} className="text-[#000080]" />
                            <div>
                                <h3 className="font-bold text-slate-800">Matriks Hak Akses per Peran</h3>
                                <p className="text-xs text-slate-500">
                                    {isEditingMatrix
                                        ? 'Mode Edit aktif — klik sel untuk mengubah level akses.'
                                        : 'Tekan Edit untuk mengubah hak akses per peran.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {isEditingMatrix ? (
                                <>
                                    <button
                                        onClick={() => { resetMatrix(); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                        title="Reset ke default"
                                    >
                                        <RotateCcw size={14} /> Reset
                                    </button>
                                    <button
                                        onClick={() => setIsEditingMatrix(false)}
                                        className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#000080] rounded-lg hover:bg-[#000060] transition-colors"
                                    >
                                        Selesai
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={() => setIsEditingMatrix(true)}
                                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-[#000080] bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                                >
                                    <Edit2 size={13} /> Edit Matriks
                                </button>
                            )}
                            <button onClick={() => { setShowAccessMatrix(false); setIsEditingMatrix(false); }} className="p-1 hover:bg-slate-200 rounded-full text-slate-400"><X size={18} /></button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                                    <th className="p-3 text-left min-w-[160px]">Fitur</th>
                                    {ROLE_OPTIONS.map(role => (
                                        <th key={role} className="p-3 text-center whitespace-nowrap">{getRoleLabel(role)}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {FEATURE_KEYS.map(featureKey => (
                                    <tr key={featureKey} className="hover:bg-slate-50/50">
                                        <td className="p-3 font-medium text-slate-700">{FEATURE_LABELS[featureKey]}</td>
                                        {ROLE_OPTIONS.map(role => {
                                            const level = getAccess(featureKey, role);
                                            const cfg = LEVEL_CONFIG[level];
                                            const nextLevel = LEVEL_CYCLE[(LEVEL_CYCLE.indexOf(level) + 1) % LEVEL_CYCLE.length];
                                            // Super admin always has full access, don't allow changing
                                            const isLocked = role === 'admin' || !isEditingMatrix;
                                            return (
                                                <td key={role} className="p-2 text-center">
                                                    <button
                                                        onClick={() => !isLocked && setAccess(featureKey, role, nextLevel)}
                                                        disabled={isLocked}
                                                        className={`inline-flex items-center justify-center w-20 h-7 rounded-lg border text-xs font-bold transition-all ${isEditingMatrix && !isLocked
                                                            ? `${cfg.cellCls} cursor-pointer ring-1 ring-offset-1 ring-transparent hover:ring-current`
                                                            : `${cfg.cellCls} opacity-80 cursor-default`
                                                            }`}
                                                        title={
                                                            role === 'admin' ? 'Super Admin selalu punya akses penuh'
                                                                : !isEditingMatrix ? 'Tekan Edit untuk mengubah'
                                                                    : `Klik untuk ubah ke ${LEVEL_CONFIG[nextLevel].label}`
                                                        }
                                                    >
                                                        {cfg.icon} <span className="ml-1">{cfg.label}</span>
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">✓ Penuh</span> Akses penuh + edit</span>
                        <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">👁 View</span> Lihat saja</span>
                        <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-400 font-bold">— Tidak Ada</span> Menu tersembunyi</span>
                        <span className="text-slate-400 italic ml-auto">Perubahan disimpan otomatis di browser ini.</span>
                    </div>
                </div>
            )}

            {/* Role Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {ROLE_OPTIONS.map(role => (
                    <button
                        key={role}
                        onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${roleFilter === role
                            ? 'border-[#000080] bg-blue-50 shadow-md'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                    >
                        <div className={`text-2xl font-extrabold ${roleFilter === role ? 'text-[#000080]' : 'text-slate-800'}`}>{roleCounts[role]}</div>
                        <div className="text-xs font-bold text-slate-500 mt-1">{getRoleLabel(role)}</div>
                    </button>
                ))}
            </div>

            {/* Main Table Card */}
            <div className="bg-white rounded-2xl shadow-md shadow-blue-900/5 border border-slate-200 overflow-hidden">
                {/* Search & Filter Bar */}
                <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Cari nama, username, atau email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#000080] text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Users size={16} />
                        <span className="font-medium">{filteredUsers.length} pengguna</span>
                        {roleFilter !== 'all' && (
                            <button
                                onClick={() => setRoleFilter('all')}
                                className="ml-2 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold hover:bg-slate-200 transition-colors"
                            >
                                Reset Filter ×
                            </button>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider">
                            <tr>
                                <th className="p-4 w-12">#</th>
                                <th className="p-4">Identitas Pengguna</th>
                                <th className="p-4">Kontak</th>
                                <th className="p-4">Peran</th>
                                <th className="p-4">Cakupan Lab</th>
                                <th className="p-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredUsers.length > 0 ? filteredUsers.map((user, idx) => (
                                <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="p-4 text-slate-400 font-mono text-sm">{idx + 1}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={user.avatar}
                                                alt={user.name}
                                                className="w-10 h-10 rounded-full bg-slate-200 object-cover ring-2 ring-slate-100"
                                            />
                                            <div className="min-w-0">
                                                <div className="font-bold text-slate-900 truncate">{user.name}</div>
                                                <div className="text-xs text-slate-400 font-mono truncate">@{user.username}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="text-sm text-slate-700">{user.email || '-'}</div>
                                        <div className="text-xs text-slate-400">{user.phone || '-'}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${getRoleColor(user.role)}`}>
                                            {getRoleLabel(user.role)}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className="text-sm text-slate-600 capitalize font-medium">
                                            {['admin', 'kepala_sekolah', 'sarpras'].includes(user.role)
                                                ? <span className="text-slate-400 italic text-xs">Global</span>
                                                : user.labScope === 'all'
                                                    ? 'Semua Lab'
                                                    : user.labScope || '-'
                                            }
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => setEditingUser(user)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                            {user.id !== currentUser?.id && (
                                                <button
                                                    onClick={() => { void handleDelete(user.id); }}
                                                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                    title="Hapus"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center">
                                        <Users className="mx-auto text-slate-300 mb-3" size={40} />
                                        <p className="text-slate-500 font-medium">Tidak ada pengguna ditemukan.</p>
                                        <p className="text-xs text-slate-400 mt-1">Coba ubah kata kunci atau filter peran.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Table Footer */}
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                    <span>Total: <b>{allUsers.length}</b> pengguna terdaftar</span>
                    <span>Hanya <b>Super Admin</b> yang dapat mengelola halaman ini.</span>
                </div>
            </div>

            {/* Modals */}
            {isAddModalOpen && <UserModal onClose={() => setIsAddModalOpen(false)} />}
            {editingUser && <UserModal userToEdit={editingUser} onClose={() => setEditingUser(null)} />}
        </div>
    );
};

// ── User Modal (Add / Edit) ───────────────────────────────────────────────────
function UserModal({ userToEdit, onClose }: { userToEdit?: User | null; onClose: () => void }) {
    const { registerUser, updateUser } = useAuth();
    const [formData, setFormData] = useState<Partial<User>>({
        name: userToEdit?.name || '',
        username: userToEdit?.username || '',
        email: userToEdit?.email || '',
        phone: userToEdit?.phone || '',
        role: userToEdit?.role || 'guru',
        labScope: userToEdit?.labScope || undefined,
    });
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (userToEdit) {
                await updateUser(userToEdit.id, formData, password || undefined);
            } else {
                if (!password || password.length < 4) {
                    alert('Kata sandi minimal 4 karakter.');
                    setLoading(false);
                    return;
                }
                await registerUser(formData as Omit<User, 'id'>, password);
            }
            onClose();
        } catch (error) {
            console.error('Failed to save user:', error);
            alert(error instanceof Error ? error.message : 'Gagal menyimpan pengguna.');
        } finally {
            setLoading(false);
        }
    };

    const selectedRole = formData.role as UserRole;
    const scopeDisabled = ['admin', 'kepala_sekolah', 'sarpras'].includes(selectedRole);

    return (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-200 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">{userToEdit ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}</h3>
                        <p className="text-xs text-slate-500">{userToEdit ? 'Perbarui informasi akun pengguna.' : 'Buat akun baru untuk mengakses sistem.'}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"><X size={20} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">

                    {/* Credentials */}
                    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kredensial Akun</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Username <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    value={formData.username}
                                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#000080] outline-none bg-white text-sm"
                                    placeholder="contoh: guru_produktif"
                                />
                            </div>
                            <div className="col-span-2 md:col-span-1">
                                <label className="block text-sm font-semibold text-slate-700 mb-1">
                                    Kata Sandi {!userToEdit && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                    type="password"
                                    required={!userToEdit}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#000080] outline-none bg-white text-sm"
                                    placeholder={userToEdit ? 'Kosongkan jika tidak diubah' : 'Min. 4 karakter'}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Personal Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-sm font-medium text-slate-600 mb-1">Nama Lengkap <span className="text-red-500">*</span></label>
                            <input
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#000080] outline-none text-sm"
                                placeholder="Nama lengkap pengguna"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#000080] outline-none text-sm"
                                placeholder="email@contoh.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1">No. Telepon</label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#000080] outline-none text-sm"
                                placeholder="+62..."
                            />
                        </div>
                    </div>

                    {/* Role Selection */}
                    <div className="space-y-3">
                        <label className="block text-sm font-bold text-slate-800">Peran & Tingkat Akses</label>
                        <div className="relative">
                            <select
                                value={formData.role}
                                onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                                className="w-full p-3 border-2 border-blue-100 rounded-xl focus:ring-2 focus:ring-[#000080] outline-none bg-blue-50 text-[#000080] font-bold appearance-none pr-10 text-sm"
                            >
                                {ROLE_OPTIONS.map(role => (
                                    <option key={role} value={role}>{getRoleLabel(role)}</option>
                                ))}
                            </select>
                            <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#000080] pointer-events-none" />
                        </div>
                        <p className="text-xs text-slate-500 italic pl-1">{ROLE_CONFIG[selectedRole]?.description}</p>
                    </div>

                    {/* Lab Scope */}
                    <div className={`p-4 rounded-xl border ${scopeDisabled ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-orange-50 border-orange-100'}`}>
                        <label className={`block text-sm font-bold mb-1 ${scopeDisabled ? 'text-slate-500' : 'text-orange-800'}`}>Cakupan Operasional</label>
                        <p className={`text-xs mb-2 ${scopeDisabled ? 'text-slate-400' : 'text-orange-600'}`}>
                            {scopeDisabled ? 'Peran ini memiliki akses global otomatis.' : 'Menentukan area laboratorium yang dapat dikelola.'}
                        </p>
                        <select
                            value={formData.labScope || 'all'}
                            onChange={e => setFormData({ ...formData, labScope: e.target.value as User['labScope'] })}
                            className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white text-sm"
                            disabled={scopeDisabled}
                        >
                            <option value="all">Semua Lab (Akses Global)</option>
                            <option value="computer">Hanya Lab Komputer</option>
                            <option value="biology">Hanya Lab Biologi</option>
                            <option value="physics">Hanya Lab Fisika</option>
                        </select>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors text-sm">Batal</button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2.5 bg-[#000080] text-white rounded-xl hover:bg-[#000060] font-bold shadow-md shadow-blue-900/10 transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Menyimpan...' : 'Simpan Pengguna'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default UserManagement;
