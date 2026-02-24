import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import type { Room, ItemLog, Container, Item } from '../types';
import { usePortal } from './PortalContext';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/public/api').replace(/\/+$/, '');
const ROOMS_ENDPOINT = `${API_BASE_URL}/inventory/rooms.php`;

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
    addRoom: (room: Omit<Room, 'id'> & { id?: string }) => Promise<void>;
    saveRoom: (room: Room) => Promise<void>;
    updateRoom: (room: Room) => Promise<void>;
    deleteRoom: (id: string) => Promise<void>;
    getRoom: (id: string) => Room | undefined;
    addContainers: (roomId: string, containers: Omit<Container, 'id'>[]) => Promise<void>;
    updateContainer: (roomId: string, container: Container) => Promise<void>;
    deleteContainer: (roomId: string, containerId: string) => Promise<void>;
    reorderContainers: (roomId: string, containerIds: string[]) => Promise<void>;
    refreshRooms: () => Promise<void>;

    // Container/Item actions could be moved here or kept in room-specific logic
    // For Overview, we mainly need read access to all nested data

    stats: InventoryStats;
    recentLogs: { roomName: string; itemName: string; log: ItemLog }[];
    loading: boolean;
    error: string | null;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

const normalizeLog = (raw: unknown): ItemLog => {
    const log = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<ItemLog> & Record<string, unknown>;
    return {
        id: String(log.id ?? `log-${Date.now()}`),
        date: typeof log.date === 'string' ? log.date : new Date().toISOString(),
        action: typeof log.action === 'string' && log.action.trim().length > 0 ? log.action : 'UNKNOWN',
        details: typeof log.details === 'string' ? log.details : JSON.stringify(log.details ?? '')
    };
};

const normalizeItem = (raw: unknown): Item => {
    const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Item> & Record<string, unknown>;
    const condition = item.condition === 'good' || item.condition === 'service' || item.condition === 'damaged' || item.condition === 'broken'
        ? item.condition
        : 'good';
    const status = item.status === 'available' || item.status === 'in_use' || item.status === 'maintenance' || item.status === 'missing'
        ? item.status
        : 'available';
    const parameters = Array.isArray(item.parameters)
        ? item.parameters
            .map((entry) => {
                if (typeof entry !== 'object' || entry === null) return null;
                const param = entry as Record<string, unknown>;
                return {
                    label: String(param.label ?? ''),
                    value: String(param.value ?? '')
                };
            })
            .filter((entry): entry is { label: string; value: string } => entry !== null)
        : [];

    return {
        id: String(item.id ?? `item-${Date.now()}`),
        name: typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : 'Unnamed Item',
        type: typeof item.type === 'string' && item.type.trim().length > 0 ? item.type : 'General',
        condition,
        status,
        specs: typeof item.specs === 'string' ? item.specs : '',
        image_layer: typeof item.image_layer === 'string' ? item.image_layer : undefined,
        logs: Array.isArray(item.logs) ? item.logs.map(normalizeLog) : [],
        sku: typeof item.sku === 'string' ? item.sku : undefined,
        category: typeof item.category === 'string' ? item.category : undefined,
        isConsumable: Boolean(item.isConsumable),
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        unit: typeof item.unit === 'string' ? item.unit : 'Pcs',
        minStock: typeof item.minStock === 'number' ? item.minStock : 0,
        parameters
    };
};

const normalizeContainer = (raw: unknown): Container => {
    const container = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Container> & Record<string, unknown>;
    const status = container.status === 'good' || container.status === 'warning' || container.status === 'error'
        ? container.status
        : 'good';
    const positionRaw = (typeof container.position === 'object' && container.position !== null ? container.position : {}) as Record<string, unknown>;
    const x = typeof positionRaw.x === 'number' ? positionRaw.x : 0;
    const y = typeof positionRaw.y === 'number' ? positionRaw.y : 0;

    return {
        id: String(container.id ?? `container-${Date.now()}`),
        name: typeof container.name === 'string' && container.name.trim().length > 0 ? container.name : 'Container',
        type: container.type === 'table' || container.type === 'cupboard' || container.type === 'shelf' ? container.type : 'table',
        status,
        items: Array.isArray(container.items) ? container.items.map(normalizeItem) : [],
        position: { x, y }
    };
};

const normalizeRooms = (raw: unknown): Room[] => {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry) => {
            if (typeof entry !== 'object' || entry === null) return null;
            const room = entry as Partial<Room> & Record<string, unknown>;
            const roomType = room.type === 'computer' || room.type === 'physics' || room.type === 'biology' || room.type === 'classroom' || room.type === 'office' || room.type === 'warehouse' || room.type === 'other'
                ? room.type
                : 'other';
            const category = room.category === 'lab' || room.category === 'non-lab' ? room.category : 'lab';
            return {
                id: String(room.id ?? `room-${Date.now()}`),
                name: typeof room.name === 'string' && room.name.trim().length > 0 ? room.name : 'Unnamed Room',
                category,
                type: roomType,
                customType: typeof room.customType === 'string' ? room.customType : undefined,
                capacity: typeof room.capacity === 'number' ? room.capacity : 0,
                containers: Array.isArray(room.containers) ? room.containers.map(normalizeContainer) : []
            } as Room;
        })
        .filter((room): room is Room => room !== null);
};



export const InventoryProvider = ({ children }: { children: ReactNode }) => {
    const { portalType } = usePortal();
    const [rooms, setRooms] = useState<Room[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const getErrorMessage = (fallback: string, payload?: { message?: unknown; debug?: unknown }) => {
        if (typeof payload?.message === 'string' && payload.message.trim().length > 0) {
            if (typeof payload?.debug === 'string' && payload.debug.trim().length > 0) {
                return `${payload.message} (${payload.debug})`;
            }
            return payload.message;
        }
        return fallback;
    };

    const requestMutation = async (url: string, init: RequestInit, fallbackMessage: string) => {
        const response = await fetch(url, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                ...(init.headers ?? {})
            }
        });

        const payload = await response.json().catch(() => ({})) as { status?: string; message?: string; debug?: string };
        if (!response.ok || payload.status === 'error') {
            throw new Error(getErrorMessage(fallbackMessage, payload));
        }

        return payload;
    };

    const fetchRooms = async (showLoading = true) => {
        if (showLoading) {
            setLoading(true);
        }

        try {
            const response = await fetch(ROOMS_ENDPOINT);
            if (!response.ok) throw new Error('Failed to fetch inventory');
            const data = await response.json() as unknown;
            setRooms(normalizeRooms(data));
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Gagal memuat data inventory.');
            // Fallback to empty or keep emptyMain
        } finally {
            if (showLoading) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        void fetchRooms();
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

    const addRoom = async (room: Omit<Room, 'id'> & { id?: string }) => {
        try {
            await requestMutation(
                `${ROOMS_ENDPOINT}?entity=room`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        id: room.id ?? null,
                        name: room.name,
                        category: room.category ?? portalType,
                        type: room.type,
                        customType: room.customType ?? null,
                        capacity: room.capacity ?? 0
                    })
                },
                'Gagal menambah room.'
            );

            await fetchRooms(false);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Gagal menambah room.');
            throw err;
        }
    };

    const saveRoom = async (room: Room) => {
        try {
            await requestMutation(
                `${ROOMS_ENDPOINT}?entity=room`,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        id: room.id,
                        name: room.name,
                        category: room.category,
                        type: room.type,
                        customType: room.customType ?? null,
                        capacity: room.capacity ?? 0
                    })
                },
                'Gagal memperbarui room.'
            );

            await fetchRooms(false);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Gagal memperbarui room.');
            throw err;
        }
    };

    const persistRoomState = async (room: Room) => {
        await requestMutation(
            `${ROOMS_ENDPOINT}?entity=room-state`,
            {
                method: 'PUT',
                body: JSON.stringify({
                    id: room.id,
                    name: room.name,
                    category: room.category,
                    type: room.type,
                    customType: room.customType ?? null,
                    capacity: room.capacity ?? 0,
                    containers: room.containers ?? []
                })
            },
            'Gagal sinkronisasi perubahan room.'
        );
    };

    // Optimistic room update + backend synchronization.
    const updateRoom = async (updatedRoom: Room) => {
        setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));

        try {
            await persistRoomState(updatedRoom);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Gagal sinkronisasi perubahan room.');
            await fetchRooms(false);
            throw err;
        }
    };

    const addContainers = async (roomId: string, containers: Omit<Container, 'id'>[]) => {
        try {
            await requestMutation(
                `${ROOMS_ENDPOINT}?entity=container-bulk`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        roomId,
                        containers
                    })
                },
                'Gagal menambah container.'
            );

            await fetchRooms(false);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Gagal menambah container.');
            throw err;
        }
    };

    // Persist container + nested items to backend.
    const updateContainer = async (roomId: string, updatedContainer: Container) => {
        try {
            await requestMutation(
                `${ROOMS_ENDPOINT}?entity=container`,
                {
                    method: 'PUT',
                    body: JSON.stringify({
                        roomId,
                        ...updatedContainer
                    })
                },
                'Gagal memperbarui container.'
            );

            await fetchRooms(false);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Gagal memperbarui container.');
            throw err;
        }
    };

    const deleteContainer = async (roomId: string, containerId: string) => {
        try {
            await requestMutation(
                `${ROOMS_ENDPOINT}?entity=container`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({
                        roomId,
                        id: containerId
                    })
                },
                'Gagal menghapus container.'
            );

            await fetchRooms(false);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Gagal menghapus container.');
            throw err;
        }
    };

    const reorderContainers = async (roomId: string, containerIds: string[]) => {
        try {
            await requestMutation(
                `${ROOMS_ENDPOINT}?entity=container-reorder`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        roomId,
                        containerIds
                    })
                },
                'Gagal mengurutkan container.'
            );

            await fetchRooms(false);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Gagal mengurutkan container.');
            throw err;
        }
    };

    const deleteRoom = async (id: string) => {
        try {
            await requestMutation(
                `${ROOMS_ENDPOINT}?entity=room`,
                {
                    method: 'DELETE',
                    body: JSON.stringify({ id })
                },
                'Gagal menghapus room.'
            );

            await fetchRooms(false);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'Gagal menghapus room.');
            throw err;
        }
    };

    const getRoom = (id: string) => rooms.find(r => r.id === id);

    const value = useMemo(() => ({
        rooms: filteredRooms,
        addRoom,
        saveRoom,
        updateRoom,
        deleteRoom,
        getRoom,
        addContainers,
        updateContainer,
        deleteContainer,
        reorderContainers,
        refreshRooms: () => fetchRooms(false),
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
