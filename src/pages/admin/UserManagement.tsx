import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { User, UserRole } from '../../types';
import { Search, Plus, Trash2, Edit2 } from 'lucide-react';

const UserManagement = () => {
    const { allUsers, registerUser, updateUser, deleteUser, user: currentUser } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Filtered Users
    const filteredUsers = allUsers.filter(u =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleDelete = (id: string) => {
        if (confirm('Are you sure you want to delete this user?')) {
            deleteUser(id);
        }
    };

    const UserModal = ({ userToEdit, onClose }: { userToEdit?: User | null, onClose: () => void }) => {
        const [formData, setFormData] = useState<Partial<User>>({
            name: userToEdit?.name || '',
            username: userToEdit?.username || '',
            email: userToEdit?.email || '',
            phone: userToEdit?.phone || '',
            role: userToEdit?.role || 'guru',
            labScope: userToEdit?.labScope || undefined
        });

        // Mock password field
        const [password, setPassword] = useState('');

        const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            // In a real app, send password. For mock, we ignore it or could adding to user object if we wanted.

            if (userToEdit) {
                updateUser(userToEdit.id, formData);
            } else {
                await registerUser(formData as Omit<User, 'id'>);
            }
            onClose();
        };

        return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-fade-in-up shadow-2xl max-h-[90vh] overflow-y-auto">
                    <h3 className="text-xl font-bold mb-6 text-gray-900 border-b border-gray-100 pb-2">
                        {userToEdit ? 'Edit User' : 'Add New User'}
                    </h3>

                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* 1. Account Credentials */}
                        <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Account Credentials</h4>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Username <span className="text-red-500">*</span></label>
                                <input
                                    required
                                    value={formData.username}
                                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white transition-all"
                                    placeholder="e.g. guru_produktif"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    Password
                                    {!userToEdit && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                    type="password"
                                    required={!userToEdit}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full p-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white transition-all"
                                    placeholder={userToEdit ? "Leave empty to keep current" : "Min. 6 characters"}
                                />
                            </div>
                        </div>

                        {/* 2. Personal Information */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-600 mb-1">Phone Number</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="+62..."
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-600 mb-1">Full Name</label>
                                <input
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-600 mb-1">Email (Optional)</label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* 3. Role & Access */}
                        <div className="pt-2">
                            <label className="block text-sm font-bold text-gray-800 mb-2">Role & Access Level</label>
                            <select
                                value={formData.role}
                                onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                                className="w-full p-3 border-2 border-indigo-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-indigo-50 text-indigo-900 font-bold"
                            >
                                <option value="admin">Super Admin (Full Access)</option>
                                <option value="kepala_lab">Head of Lab (Room Control)</option>
                                <option value="guru">Teacher (Inventory Control)</option>
                                <option value="kepala_sekolah">Principal (View Only)</option>
                                <option value="sarpras">Facilities (Service Requests)</option>
                            </select>
                        </div>

                        {/* Scope Selection */}
                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                            <label className="block text-sm font-bold text-orange-800 mb-1">Operational Scope</label>
                            <p className="text-xs text-orange-600 mb-2">Defines which laboratory areas this user can manage.</p>
                            <select
                                value={formData.labScope || 'all'}
                                onChange={e => setFormData({ ...formData, labScope: e.target.value as User['labScope'] })}
                                className="w-full p-2 border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white"
                                // Scope is most relevant for Heads of Lab and Teachers
                                disabled={['admin', 'kepala_sekolah', 'sarpras'].includes(formData.role!)}
                            >
                                <option value="all">All Labs (Global Access)</option>
                                <option value="computer">Computer Lab Only</option>
                                <option value="biology">Biology Lab Only</option>
                                <option value="physics">Physics Lab Only</option>
                            </select>
                        </div>

                        <div className="flex gap-3 justify-end pt-6 border-t border-gray-100 mt-4">
                            <button type="button" onClick={onClose} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors">Cancel</button>
                            <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-200 transition-all transform hover:-translate-y-0.5">Save User</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
                    <p className="text-gray-500">Manage system access and roles.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-indigo-200"
                >
                    <Plus size={20} /> Add User
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-500 font-semibold text-xs uppercase tracking-wider">
                            <tr>
                                <th className="p-4">User Identity</th>
                                <th className="p-4">Contact</th>
                                <th className="p-4">Role</th>
                                <th className="p-4">Scope</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4">
                                        <div className="flex items-center gap-3">
                                            <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full bg-gray-200" />
                                            <div>
                                                <div className="font-bold text-gray-900">{user.username}</div>
                                                <div className="text-xs text-gray-500 uppercase">{user.name}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="text-sm text-gray-900">{user.phone || '-'}</div>
                                        <div className="text-xs text-gray-400">{user.email}</div>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                                            ${user.role === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                                                user.role === 'kepala_lab' ? 'bg-emerald-100 text-emerald-700' :
                                                    user.role === 'guru' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-gray-100 text-gray-600'}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="p-4 capitalize text-gray-500 font-medium">
                                        {user.labScope === 'all' ? 'Unrestricted' : user.labScope || '-'}
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setEditingUser(user)}
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                            >
                                                <Edit2 size={18} />
                                            </button>
                                            {user.id !== currentUser?.id && (
                                                <button
                                                    onClick={() => handleDelete(user.id)}
                                                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {isAddModalOpen && <UserModal onClose={() => setIsAddModalOpen(false)} />}
            {editingUser && <UserModal userToEdit={editingUser} onClose={() => setEditingUser(null)} />}
        </div>
    );
};

export default UserManagement;
