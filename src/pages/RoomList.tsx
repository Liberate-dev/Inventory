import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, FlaskConical, Atom, Plus, X, Edit, Trash2, Box } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Room } from '../types';


import { useInventory } from '../context/InventoryContext';
import { useLanguage } from '../context/LanguageContext';

const getIcon = (type: Room['type']) => {
    switch (type) {
        case 'computer': return Monitor;
        case 'physics': return Atom;
        case 'biology': return FlaskConical;
        case 'other': return Box;
        default: return Box;
    }
};

const getColor = (type: Room['type']) => {
    switch (type) {
        case 'computer': return 'bg-blue-50 text-blue-600';
        case 'physics': return 'bg-purple-50 text-purple-600';
        case 'biology': return 'bg-green-50 text-green-600';
        case 'other': return 'bg-orange-50 text-orange-600';
        default: return 'bg-gray-50 text-gray-600';
    }
};

const RoomList = () => {
    const navigate = useNavigate();
    const { rooms, addRoom, updateRoom, deleteRoom } = useInventory();
    const { t } = useLanguage();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentRoom, setCurrentRoom] = useState<Partial<Room>>({});
    const [roomToDelete, setRoomToDelete] = useState<string | null>(null);

    const handleAddRoom = () => {
        setCurrentRoom({ type: 'computer', capacity: 20 });
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

    const confirmDeleteRoom = () => {
        if (roomToDelete) {
            deleteRoom(roomToDelete);
            setRoomToDelete(null);
        }
    };

    const handleSaveRoom = () => {
        if (!currentRoom.name || !currentRoom.id) return;

        if (currentRoom.type === 'other' && !currentRoom.customType) {
            alert('Please specify the room type');
            return;
        }

        const roomData = currentRoom as Room;
        const exists = rooms.find(r => r.id === roomData.id);

        // If editing an existing room
        if (exists && exists.id === roomData.id) {
            updateRoom(roomData);
        }
        // If creating new room but ID exists
        else if (exists) {
            alert('Room ID must be unique');
            return;
        }
        // New room
        else {
            addRoom({ ...roomData, containers: [] });
        }

        setIsModalOpen(false);
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-800">{t('manage_rooms_title')}</h3>
                <button
                    onClick={handleAddRoom}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors shadow-sm"
                >
                    <Plus size={18} /> {t('add_room')}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {rooms.map((room) => {
                    const Icon = getIcon(room.type);
                    const colorClass = getColor(room.type);

                    return (
                        <motion.div
                            key={room.id}
                            whileHover={{ y: -5 }}
                            onClick={() => navigate(`/dashboard/rooms/${room.id}`)}
                            className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer transition-shadow group relative"
                        >
                            {/* Actions */}


                            <div className="flex items-start justify-between mb-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorClass}`}>
                                    <Icon size={24} />
                                </div>
                                <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                                    {room.capacity} {t('stations')}
                                </span>
                            </div>

                            <h4 className="text-lg font-bold text-gray-900 mb-1">{room.name}</h4>
                            <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between items-center text-sm">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${room.type === 'computer' ? 'bg-blue-100 text-blue-700' :
                                    room.type === 'physics' ? 'bg-purple-100 text-purple-700' :
                                        room.type === 'biology' ? 'bg-green-100 text-green-700' :
                                            'bg-orange-100 text-orange-700'
                                    }`}>
                                    {room.type === 'computer' ? t('lab_computer') :
                                        room.type === 'physics' ? t('lab_physics') :
                                            room.type === 'biology' ? t('lab_biology') :
                                                room.customType || t('lab_other')}
                                </span>

                                <div className="flex gap-1">
                                    <button
                                        onClick={(e) => handleEditRoom(e, room)}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
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
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Room Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
                    >
                        <div className="flex justify-between items-center p-4 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800">
                                {currentRoom.id && rooms.find(r => r.id === currentRoom.id) ? t('edit_room') : t('add_room')}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('room_id')}</label>
                                <input
                                    type="text"
                                    value={currentRoom.id || ''}
                                    onChange={(e) => setCurrentRoom({ ...currentRoom, id: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="e.g. lab-chem-1"
                                    disabled={!!(currentRoom.id && rooms.find(r => r.id === currentRoom.id))}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('room_name')}</label>
                                <input
                                    type="text"
                                    value={currentRoom.name || ''}
                                    onChange={(e) => setCurrentRoom({ ...currentRoom, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="Chemistry Lab A"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('room_type')}</label>
                                <select
                                    value={currentRoom.type || 'computer'}
                                    onChange={(e) => setCurrentRoom({ ...currentRoom, type: e.target.value as any })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="computer">{t('lab_computer')}</option>
                                    <option value="physics">{t('lab_physics')}</option>
                                    <option value="biology">{t('lab_biology')}</option>
                                    <option value="other">{t('lab_other')}</option>
                                </select>
                            </div>
                            {currentRoom.type === 'other' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('specify_type')}</label>
                                    <input
                                        type="text"
                                        value={currentRoom.customType || ''}
                                        onChange={(e) => setCurrentRoom({ ...currentRoom, customType: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="e.g. Chemistry, Robotics"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">{t('capacity')}</label>
                                <input
                                    type="number"
                                    value={currentRoom.capacity || 20}
                                    onChange={(e) => setCurrentRoom({ ...currentRoom, capacity: parseInt(e.target.value) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <button
                                onClick={handleSaveRoom}
                                className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors mt-2"
                            >
                                {t('save_room')}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
            {/* Delete Confirmation Modal */}
            {roomToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
                    >
                        <div className="p-6 text-center">
                            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-800 mb-2">{t('delete_room')}</h3>
                            <p className="text-gray-500 mb-6">{t('confirm_delete_room')}</p>

                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={() => setRoomToDelete(null)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                                >
                                    {t('btn_cancel') || 'Cancel'}
                                </button>
                                <button
                                    onClick={confirmDeleteRoom}
                                    className="px-4 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-500 transition-colors"
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
