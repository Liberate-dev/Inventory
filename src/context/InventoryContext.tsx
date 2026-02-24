import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import type { Room, ItemLog, Container } from '../types';
import { usePortal } from './PortalContext';

interface InventoryStats {
    totalRooms: number;
    totalAssets: number;
    health: {
        good: number;
        service: number;
        damaged: number;
        broken: number;
    };
    grading: number; // 0-100 score
}

interface InventoryContextType {
    rooms: Room[];
    addRoom: (room: Room) => void;
    updateRoom: (room: Room) => void;
    deleteRoom: (id: string) => void;
    getRoom: (id: string) => Room | undefined;
    updateContainer: (roomId: string, container: Container) => void; // New Action

    // Container/Item actions could be moved here or kept in room-specific logic
    // For Overview, we mainly need read access to all nested data

    stats: InventoryStats;
    recentLogs: { roomName: string; itemName: string; log: ItemLog }[];
    loading: boolean;
    error: string | null;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);



export const InventoryProvider = ({ children }: { children: ReactNode }) => {
    const { portalType } = usePortal();
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRooms = async () => {
        try {
            const response = await fetch('http://localhost:8000/api/inventory/rooms.php');
            if (!response.ok) throw new Error('Failed to fetch inventory');
            const data = await response.json();
            setRooms(data);
        } catch (err) {
            console.error(err);
            setError('Gagal memuat data inventory.');
            // Fallback to empty or keep emptyMain
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRooms();
    }, []);

    // Effect for local storage REMOVED explicitly to rely on DB
    // (Or we can keep it as backup, but better to rely on API)


    // Filter rooms based on active portal
    const filteredRooms = useMemo(() => rooms.filter(r => r.category === portalType), [rooms, portalType]);

    // Derived Stats
    const stats: InventoryStats = {
        totalRooms: filteredRooms.length,
        totalAssets: 0,
        health: { good: 0, service: 0, damaged: 0, broken: 0 },
        grading: 100
    };

    const recentLogs: { roomName: string; itemName: string; log: ItemLog }[] = [];

    // Calculate Stats & Collect Logs (using filtered rooms)
    filteredRooms.forEach(room => {
        room.containers?.forEach(container => {
            container.items?.forEach(item => {
                stats.totalAssets++;
                if (item.condition) {
                    stats.health[item.condition]++;
                } else {
                    // Fallback for legacy data migration
                    const legacyStatus = (item as any).status;
                    if (['good', 'service', 'damaged', 'broken'].includes(legacyStatus)) {
                        stats.health[legacyStatus as 'good']++;
                    }
                }

                // Collect logs
                if (item.logs) {
                    item.logs.forEach(log => {
                        recentLogs.push({
                            roomName: room.name,
                            itemName: item.name,
                            log
                        });
                    });
                }
            });
        });
    });

    // Sort logs by date desc and take top 10
    recentLogs.sort((a, b) => new Date(b.log.date).getTime() - new Date(a.log.date).getTime());
    const limitedLogs = recentLogs.slice(0, 10);

    // Calculate grading (simple percentage of good items)
    if (stats.totalAssets > 0) {
        stats.grading = Math.round((stats.health.good / stats.totalAssets) * 100);
    }

    const addRoom = (room: Room) => {
        setRooms(prev => [...prev, { ...room, category: portalType }]);
    };

    const updateRoom = (updatedRoom: Room) => {
        setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
    };

    // Clean Action to update a container without manual Room mapping
    const updateContainer = (roomId: string, updatedContainer: Container) => {
        setRooms(prev => prev.map(room => {
            if (room.id !== roomId) return room;
            return {
                ...room,
                containers: room.containers.map(c => c.id === updatedContainer.id ? updatedContainer : c)
            };
        }));
    };

    const deleteRoom = (id: string) => {
        setRooms(prev => prev.filter(r => r.id !== id));
    };

    const getRoom = (id: string) => rooms.find(r => r.id === id);

    const value = useMemo(() => ({
        rooms: filteredRooms,
        addRoom,
        updateRoom,
        deleteRoom,
        getRoom,
        updateContainer,
        stats,
        recentLogs: limitedLogs,
        loading,
        error
    }), [filteredRooms, stats, limitedLogs, loading, error]);

    return (
        <InventoryContext.Provider value={value}>
            {children}
        </InventoryContext.Provider>
    );
};

export const useInventory = () => {
    const context = useContext(InventoryContext);
    if (!context) {
        throw new Error('useInventory must be used within an InventoryProvider');
    }
    return context;
};
