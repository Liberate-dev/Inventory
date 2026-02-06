import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ZoomIn, ZoomOut, Plus, X, Trash2, Box, Layers, LayoutTemplate, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import StationDetailModal from '../components/StationDetailModal';
import ContainerDetailModal from '../components/ContainerDetailModal';
import type { Container } from '../types';

const getRoomType = (id: string) => {
    if (id?.includes('phy')) return 'physics';
    if (id?.includes('bio')) return 'biology';
    return 'computer';
};

// Isometric Container Card
const ContainerCard = ({ container }: { container: Container }) => {
    const getIcon = () => {
        switch (container.type) {
            case 'table': return <LayoutTemplate size={32} />;
            case 'cupboard': return <Archive size={32} />;
            case 'shelf': return <Layers size={32} />;
            default: return <Box size={32} />;
        }
    };

    const getVisuals = () => {
        switch (container.type) {
            case 'table': return 'bg-amber-50 border-amber-200 text-amber-900';
            case 'cupboard': return 'bg-stone-50 border-stone-200 text-stone-900';
            case 'shelf': return 'bg-blue-50 border-blue-200 text-blue-900';
            default: return 'bg-white border-gray-200';
        }
    };

    const visualClass = getVisuals();
    const itemCount = container.items?.length || 0;

    return (
        <motion.div
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`relative w-32 h-32 rounded-xl shadow-md border-2 ${visualClass} cursor-pointer flex flex-col items-center justify-between py-6 transition-all group hover:shadow-lg`}
        >
            <div className="flex-1 flex items-center justify-center opacity-80">
                {getIcon()}
            </div>
            <div className="text-center w-full px-2">
                <div className="font-bold text-sm truncate">{container.name}</div>
                <div className="text-[10px] opacity-60 uppercase tracking-wider truncate">{itemCount} items</div>
            </div>

            <div className={`w-3 h-3 rounded-full absolute top-3 right-3 shadow-sm ${itemCount > 0 ? 'bg-emerald-500' : 'bg-gray-300'
                }`} />
        </motion.div>
    );
};

const SortableContainerItem = ({ container, onClick, onDelete }: { container: Container, onClick: (c: Container) => void, onDelete: (e: any, id: string) => void }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: container.id });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div ref={setNodeRef} style={style} className="relative group justify-self-center touch-none">
            {/* Drag Handle - optional, or whole item draggable */}
            {/* We make the whole item draggable via attributes/listeners on the wrapper or specific handle */}

            <div {...attributes} {...listeners}>
                <button
                    onClick={(e) => onDelete(e, container.id)}
                    className="absolute -top-2 -right-2 z-10 p-1.5 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:scale-110 cursor-pointer"
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on delete
                >
                    <Trash2 size={12} />
                </button>
                <div onClick={() => onClick(container)}>
                    <ContainerCard container={container} />
                </div>
            </div>
        </div>
    );
};

import { useInventory } from '../context/InventoryContext';

const RoomDetail = () => {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const { getRoom, updateRoom, updateContainer } = useInventory();
    const room = getRoom(roomId || '');

    const [scale, setScale] = useState(1);
    const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
    const roomType = getRoomType(roomId || '');

    // Get containers from global state
    const containers = room?.containers || [];

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newContainerType, setNewContainerType] = useState<'table' | 'cupboard' | 'shelf'>('table');
    const [newContainerQuantity, setNewContainerQuantity] = useState(1);

    const handleAddContainer = () => {
        if (!room) return;

        const newContainers: Container[] = Array.from({ length: newContainerQuantity }, (_, i) => ({
            id: `cont-${Date.now()}-${i}`,
            name: `${newContainerType.charAt(0).toUpperCase() + newContainerType.slice(1)} ${containers.length + i + 1}`,
            type: newContainerType,
            status: 'good',
            items: [],
            position: { x: (containers.length + i) % 4, y: Math.floor((containers.length + i) / 4) }
        }));

        updateRoom({
            ...room,
            containers: [...containers, ...newContainers]
        });

        setIsAddModalOpen(false);
        setNewContainerQuantity(1);
    };

    const handleDeleteContainer = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!room) return;
        if (confirm('Delete this container and all items inside?')) {
            updateRoom({
                ...room,
                containers: containers.filter(c => c.id !== id)
            });
        }
    };

    const handleUpdateContainer = (updatedContainer: Container) => {
        if (!room) return;
        // Clean Refactor: Use Context Action directly
        updateContainer(room.id, updatedContainer);
        setSelectedContainer(updatedContainer); // Update the currently open details
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event: any) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            const oldIndex = containers.findIndex((c) => c.id === active.id);
            const newIndex = containers.findIndex((c) => c.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                const newContainers = arrayMove(containers, oldIndex, newIndex);
                if (room) {
                    updateRoom({
                        ...room,
                        containers: newContainers
                    });
                }
            }
        }
        setActiveId(null);
    };

    const [activeId, setActiveId] = useState<string | null>(null);
    const activeContainer = activeId ? containers.find(c => c.id === activeId) : null;

    if (!room) return <div>Room not found</div>;

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/dashboard/rooms')}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">{room.name}</h2>
                        <p className="text-gray-500 text-sm">Room ID: {roomId} • {room.capacity} Capacity</p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-500 transition-colors mr-2"
                    >
                        <Plus size={18} />
                        <span>Add Container</span>
                    </button>

                    <button
                        onClick={() => setScale(s => Math.min(s + 0.1, 1.5))}
                        className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50"
                    >
                        <ZoomIn size={20} />
                    </button>
                    <button
                        onClick={() => setScale(s => Math.max(s - 0.1, 0.5))}
                        className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50"
                    >
                        <ZoomOut size={20} />
                    </button>

                </div>
            </div>

            <div className="flex-1 bg-gray-100 rounded-2xl overflow-hidden relative border border-gray-200 shadow-inner">
                {/* Isometric Grid Container */}
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                    onDragStart={(event) => setActiveId(event.active.id as string)}
                >
                    <div
                        className="absolute inset-0 overflow-auto p-8"
                        style={{
                            backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
                            backgroundSize: '30px 30px'
                        }}
                    >
                        <motion.div
                            className="w-full"
                            animate={{ scale }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            style={{
                                transformStyle: 'preserve-3d',
                                perspective: '1000px',
                                transformOrigin: 'top left'
                            }}
                        >
                            <SortableContext items={containers.map(c => c.id)} strategy={rectSortingStrategy}>
                                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-6 w-full">
                                    {containers.map((container) => (
                                        <SortableContainerItem
                                            key={container.id}
                                            container={container}
                                            onClick={setSelectedContainer}
                                            onDelete={handleDeleteContainer}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </motion.div>
                    </div>

                    <DragOverlay>
                        {activeContainer ? (
                            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} className="cursor-grabbing shadow-2xl rounded-xl">
                                <ContainerCard container={activeContainer} />
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            </div>

            <AnimatePresence>
                {selectedContainer && (
                    roomType === 'computer' && selectedContainer.type === 'table' ? (
                        <StationDetailModal
                            station={selectedContainer}
                            onClose={() => setSelectedContainer(null)}
                            onUpdate={handleUpdateContainer}
                        />
                    ) : (
                        <ContainerDetailModal
                            container={selectedContainer}
                            onClose={() => setSelectedContainer(null)}
                            onUpdate={handleUpdateContainer}
                        />
                    )
                )}
            </AnimatePresence>

            {/* Add Container Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden"
                    >
                        <div className="flex justify-between items-center p-4 border-b border-gray-100">
                            <h3 className="text-lg font-bold text-gray-800">Add New Container</h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                <select
                                    value={newContainerType}
                                    onChange={(e) => setNewContainerType(e.target.value as any)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="table">Table (Meja)</option>
                                    <option value="cupboard">Cupboard (Lemari)</option>
                                    <option value="shelf">Shelf (Rak)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    value={newContainerQuantity}
                                    onChange={(e) => setNewContainerQuantity(parseInt(e.target.value) || 1)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <button
                                onClick={handleAddContainer}
                                className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-500 transition-colors mt-2"
                            >
                                Add {newContainerQuantity} Container{newContainerQuantity > 1 ? 's' : ''}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};



export default RoomDetail;
