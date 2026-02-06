import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import type { Room, ItemLog, Item, Container } from '../types';

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
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

// Initial mock data moved from RoomList
const initialRooms: Room[] = [
    { id: 'lab-comp', name: 'Computer Lab 1', type: 'computer', capacity: 30, containers: [] },
    { id: 'lab-phy', name: 'Physics Lab', type: 'physics', capacity: 24, containers: [] },
    { id: 'lab-bio', name: 'Biology Lab', type: 'biology', capacity: 20, containers: [] },
    { id: 'lab-comp-2', name: 'Computer Lab 2', type: 'computer', capacity: 35, containers: [] },
];

export const InventoryProvider = ({ children }: { children: ReactNode }) => {
    const [rooms, setRooms] = useState<Room[]>(() => {
        const saved = localStorage.getItem('inventory_rooms');
        let parsedRooms = saved ? JSON.parse(saved) : initialRooms;

        // Auto-Migration: Ensure all items have 'condition' and 'status'
        parsedRooms = parsedRooms.map((room: Room) => ({
            ...room,
            containers: room.containers?.map(container => ({
                ...container,
                items: container.items?.map((item: any) => {
                    // Check if migration is needed (missing condition)
                    if (!item.condition) {
                        const oldStatus = item.status; // Legacy status often held condition values
                        const isConditionValue = ['good', 'service', 'damaged', 'broken'].includes(oldStatus);
                        return {
                            ...item,
                            condition: isConditionValue ? oldStatus : 'good',
                            status: 'available', // Default availability for migrated items
                        } as Item; // Cast to ensure it matches new type
                    }
                    return item;
                }) || []
            })) || []
        }));

        return parsedRooms;
    });

    useEffect(() => {
        localStorage.setItem('inventory_rooms', JSON.stringify(rooms));
    }, [rooms]);

    // Derived Stats
    const stats: InventoryStats = {
        totalRooms: rooms.length,
        totalAssets: 0,
        health: { good: 0, service: 0, damaged: 0, broken: 0 },
        grading: 100
    };

    const recentLogs: { roomName: string; itemName: string; log: ItemLog }[] = [];

    // Calculate Stats & Collect Logs
    rooms.forEach(room => {
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
        setRooms(prev => [...prev, room]);
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
        rooms,
        addRoom,
        updateRoom,
        deleteRoom,
        getRoom,
        updateContainer,
        stats,
        recentLogs: limitedLogs
    }), [rooms, stats, limitedLogs]);

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
