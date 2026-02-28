import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Monitor,
    FlaskConical,
    Atom,
    Plus,
    X,
    Edit,
    Trash2,
    Box,
    GraduationCap,
    Briefcase,
    Warehouse,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { Room } from '../types';
import { usePortal } from '../context/PortalContext';
import { useInventory } from '../context/InventoryContext';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useAccessMatrix } from '../context/AccessMatrixContext';

const getIcon = (type: Room['type']) => {
    switch (type) {
        case 'computer':
            return Monitor;
        case 'physics':
            return Atom;
        case 'biology':
            return FlaskConical;
        case 'classroom':
            return GraduationCap;
        case 'office':
            return Briefcase;
        case 'warehouse':
            return Warehouse;
        default:
            return Box;
    }
};

const getColor = (type: Room['type']) => {
    switch (type) {
        case 'computer':
            return 'bg-blue-50 text-[#000080]';
        case 'physics':
            return 'bg-purple-50 text-purple-600';
        case 'biology':
            return 'bg-green-50 text-green-600';
        case 'classroom':
            return 'bg-yellow-50 text-yellow-600';
        case 'office':
            return 'bg-slate-50 text-slate-600';
        case 'warehouse':
            return 'bg-amber-50 text-amber-600';
        default:
            return 'bg-orange-50 text-orange-600';
    }
};

const RoomList = () => {
    const navigate = useNavigate();
    const { rooms, addRoom, saveRoom, deleteRoom } = useInventory();
    const { t } = useLanguage();
    const { portalType } = usePortal();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentRoom, setCurrentRoom] = useState<Partial<Room>>({});
    const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
    const { user: currentUser } = useAuth();
    const { canEditFeature } = useAccessMatrix();
    const canEdit = currentUser ? canEditFeature('rooms', currentUser.role) : false;

    const handleAddRoom = () => {
        const defaultType = portalType === 'lab' ? 'computer' : 'classroom';
        setCurrentRoom({ type: defaultType, capacity: '' as any });
        setIsModalOpen(true);
    };

    const handleEditRoom = (e: React.MouseEvent, room: Room) => {
        e.stopPropagation();
        setCurrentRoom(room);
        setIsModalOpen(true);
    };

    const handleDeleteRoom = (e: React.MouseEvent, roomId: string) => {
        e.stopPropagation();
        setRoomToDelete(roomId);
    };

    const confirmDeleteRoom = async () => {
        if (roomToDelete) {
            try {
                await deleteRoom(roomToDelete);
                setRoomToDelete(null);
            } catch (error) {
                console.error('Failed to delete room:', error);
                alert('Gagal menghapus room. Silakan coba lagi.');
            }
        }
    };

    const handleSaveRoom = async () => {
        if (!currentRoom.name) return;

        if (currentRoom.type === 'other' && !currentRoom.customType) {
            alert('Please specify the room type');
            return;
        }

        const roomData = currentRoom as Partial<Room>;
        const isEditing = !!roomData.id && rooms.some((r) => r.id === roomData.id);

        try {
            if (isEditing) {
                await saveRoom(roomData as Room);
            } else {
                await addRoom({
                    id: roomData.id,
                    name: roomData.name || '',
                    category: portalType,
                    type: roomData.type || (portalType === 'lab' ? 'computer' : 'classroom'),
                    customType: roomData.customType,
                    capacity: typeof roomData.capacity === 'number' ? roomData.capacity : 0,
                    containers: []
                });
            }

            setIsModalOpen(false);
        } catch (error) {
            console.error('Failed to save room:', error);
            alert('Gagal menyimpan room. Silakan coba lagi.');
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-extrabold text-[#000080] tracking-tight">{t('manage_rooms_title')}</h3>
                {canEdit && (
                    <button
                        onClick={handleAddRoom}
                        className="flex items-center gap-2 px-4 py-2 bg-[#000080] text-white rounded-xl hover:bg-[#000060] transition-colors shadow-md shadow-blue-900/10 font-semibold"
                    >
                        <Plus size={18} /> {t('add_room')}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rooms.filter(room => !currentUser?.labScope || currentUser.labScope === 'all' || room.type === currentUser.labScope).map((room) => {
                    const Icon = getIcon(room.type);
                    const colorClass = getColor(room.type);

                    return (
                        <motion.div
                            key={room.id}
                            whileHover={{ y: -4 }}
                            onClick={() => navigate(`/dashboard/rooms/${room.id}`)}
                            className="bg-white p-6 rounded-2xl border border-slate-200 shadow-md shadow-blue-900/5 hover:shadow-lg cursor-pointer transition-shadow group relative"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass}`}>
                                    <Icon size={24} />
                                </div>
                                <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
                                    {room.capacity} {t('stations')}
                                </span>
                            </div>

                            <h4 className="text-lg font-bold text-slate-900 mb-1">{room.name}</h4>
                            <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center text-sm">
                                <span
                                    className={`px-2 py-1 rounded text-xs font-semibold ${room.type === 'computer'
                                        ? 'bg-blue-100 text-[#000080]'
                                        : room.type === 'physics'
                                            ? 'bg-purple-100 text-purple-700'
                                            : room.type === 'biology'
                                                ? 'bg-green-100 text-green-700'
                                                : room.type === 'classroom'
                                                    ? 'bg-yellow-100 text-yellow-700'
                                                    : room.type === 'office'
                                                        ? 'bg-slate-100 text-slate-700'
                                                        : room.type === 'warehouse'
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : 'bg-orange-100 text-orange-700'
                                        }`}
                                >
                                    {room.type === 'computer'
                                        ? t('lab_computer')
                                        : room.type === 'physics'
                                            ? t('lab_physics')
                                            : room.type === 'biology'
                                                ? t('lab_biology')
                                                : room.type === 'classroom'
                                                    ? 'Classroom'
                                                    : room.type === 'office'
                                                        ? 'Office'
                                                        : room.type === 'warehouse'
                                                            ? 'Warehouse'
                                                            : room.customType || t('lab_other')}
                                </span>

                                {canEdit && (
                                    <div className="flex gap-1">
                                        <button
                                            onClick={(e) => handleEditRoom(e, room)}
                                            className="p-1.5 text-slate-400 hover:text-[#000080] hover:bg-blue-50 rounded transition-colors"
                                            title={t('edit_room')}
                                        >
                                            <Edit size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteRoom(e, room.id)}
                                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                            title={t('delete_room')}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
                    >
                        <div className="flex justify-between items-center p-5 border-b border-slate-100">
                            <h3 className="text-lg font-bold text-slate-800">
                                {currentRoom.id && rooms.find((r) => r.id === currentRoom.id) ? t('edit_room') : t('add_room')}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('room_id')}</label>
                                <input
                                    type="text"
                                    value={currentRoom.id || ''}
                                    onChange={(e) => setCurrentRoom({ ...currentRoom, id: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#000080] outline-none"
                                    placeholder="e.g. lab-chem-1"
                                    disabled={!!(currentRoom.id && rooms.find((r) => r.id === currentRoom.id))}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('room_name')}</label>
                                <input
                                    type="text"
                                    value={currentRoom.name || ''}
                                    onChange={(e) => setCurrentRoom({ ...currentRoom, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#000080] outline-none"
                                    placeholder="Chemistry Lab A"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('room_type')}</label>
                                <select
                                    value={currentRoom.type || 'computer'}
                                    onChange={(e) => setCurrentRoom({ ...currentRoom, type: e.target.value as any })}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#000080] outline-none"
                                >
                                    {portalType === 'lab' ? (
                                        <>
                                            <option value="computer">{t('lab_computer')}</option>
                                            <option value="physics">{t('lab_physics')}</option>
                                            <option value="biology">{t('lab_biology')}</option>
                                            <option value="other">{t('lab_other')}</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="classroom">Classroom</option>
                                            <option value="office">Office</option>
                                            <option value="warehouse">Warehouse</option>
                                        </>
                                    )}
                                </select>
                            </div>
                            {currentRoom.type === 'other' && (
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">{t('specify_type')}</label>
                                    <input
                                        type="text"
                                        value={currentRoom.customType || ''}
                                        onChange={(e) => setCurrentRoom({ ...currentRoom, customType: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#000080] outline-none"
                                        placeholder="e.g. Chemistry, Robotics"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('capacity')}</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="e.g. 20"
                                    value={currentRoom.capacity ?? ''}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        setCurrentRoom({ ...currentRoom, capacity: val ? parseInt(val, 10) : '' as any });
                                    }}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#000080] outline-none"
                                />
                            </div>
                            <button
                                onClick={handleSaveRoom}
                                className="w-full py-2.5 bg-[#000080] text-white rounded-xl font-semibold hover:bg-[#000060] transition-colors mt-2"
                            >
                                {t('save_room')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {roomToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
                    >
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 mb-2">{t('delete_room')}</h3>
                            <p className="text-slate-500 mb-6">{t('confirm_delete_room')}</p>

                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setRoomToDelete(null)}
                                    className="px-4 py-2 border border-slate-200 rounded-xl text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                                >
                                    {t('btn_cancel') || 'Cancel'}
                                </button>
                                <button
                                    onClick={confirmDeleteRoom}
                                    className="px-4 py-2 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-500 transition-colors"
                                >
                                    {t('delete_room')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default RoomList;
