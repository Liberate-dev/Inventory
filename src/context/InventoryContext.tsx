import { createContext, useCallback, useContext, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Room, ItemLog, Container, Item, ComponentStatus, ComponentCondition } from '../types';
import { usePortal } from './PortalContext';
import { useAuth } from './AuthContext';
import { getAuthHeaders, getAuthToken } from '../utils/api';
import { useToast } from './ToastContext';
import { useNotifications } from './NotificationContext';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api').replace(/\/+$/, '');
const ROOMS_ENDPOINT = `${API_BASE_URL}/inventory/rooms.php`;

interface InventoryStats {
    totalRooms: number;
    totalAssets: number;
    health: {
        good: number;
        maintenance: number;
        broken: number;
        in_use: number;
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

    schedulePreventiveMaintenance: (itemId: string, recommendedDate: string, reason: string, source: 'ai' | 'manual') => Promise<void>;
    completePreventiveMaintenance: (itemId: string) => Promise<void>;
    cancelPreventiveMaintenance: (itemId: string, cancelReason: string) => Promise<void>;

    // New for integrated item type + label model
    itemTypes: any[]; // master "Item" types
    refreshItemTypes: () => Promise<void>;
    getItemTypeById: (id: string) => any | undefined;
    createItemType: (data: { name: string; type?: string; category?: string; specs?: string; parameters?: any[] }) => Promise<any>;

    // Category management for Manajemen Barang (central dropdown for item types and labels)
    categories: any[];
    refreshCategories: () => Promise<void>;
    createCategory: (name: string) => Promise<any>;
    deleteCategory: (id: number | string) => Promise<void>;

    stats: InventoryStats;
    recentLogs: { roomId: string; roomName: string; itemName: string; log: ItemLog }[];
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
    const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;

    // Migrate old status/condition to NEW status model
    let status: ComponentStatus = 'good';
    const oldStatus = String(item.status || '').toLowerCase();
    const oldCondition = String(item.condition || '').toLowerCase();

    if (oldStatus === 'in_use') {
        status = 'in_use';
    } else if (oldStatus === 'maintenance' || oldCondition === 'service') {
        status = 'maintenance';
    } else if (oldStatus === 'missing' || oldCondition === 'broken' || oldCondition === 'damaged') {
        status = 'broken';
    } else if (oldStatus === 'available' || oldCondition === 'good' || !item.status) {
        status = 'good';
    }

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

    let condition: ComponentCondition = 'good';
    if (oldCondition === 'service' || oldCondition === 'damaged' || oldCondition === 'broken') {
        condition = oldCondition as ComponentCondition;
    } else if (status === 'maintenance') {
        condition = 'service';
    } else if (status === 'broken') {
        condition = 'damaged';
    }

    return {
        id: String(item.id ?? `item-${Date.now()}`),
        name: typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : 'Unnamed Item',
        type: typeof item.type === 'string' && item.type.trim().length > 0 ? item.type : 'General',
        status,
        condition,
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
                roomOwner: typeof (room as any).room_owner === 'string' && (room as any).room_owner.trim() !== '' ? (room as any).room_owner : (typeof room.roomOwner === 'string' && room.roomOwner.trim() !== '' ? room.roomOwner : undefined),
                customType: typeof room.customType === 'string' ? room.customType : undefined,
                capacity: typeof room.capacity === 'number' ? room.capacity : 0,
                containers: Array.isArray(room.containers) ? room.containers.map(normalizeContainer) : []
            } as Room;
        })
        .filter((room): room is Room => room !== null);
};

const flattenRoomItems = (rooms: Room[]) => rooms.flatMap((room) =>
    room.containers.flatMap((container) =>
        container.items.map((item) => ({
            id: item.id,
            name: item.name,
            roomName: room.name,
            status: item.status
        }))
    )
);

export const InventoryProvider = ({ children }: { children: ReactNode }) => {
    const { portalType } = usePortal();
    const { isAuthenticated, user, logout } = useAuth();
    const { showToast } = useToast();
    const { addNotification } = useNotifications();
    const [rooms, setRooms] = useState<Room[]>([]);
    const [itemTypes, setItemTypes] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const previousRoomsRef = useRef<Room[]>([]);
    const hasHydratedRoomsRef = useRef(false);

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
            headers: getAuthHeaders({
                'Content-Type': 'application/json',
                ...(init.headers ?? {})
            })
        });

        const payload = await response.json().catch(() => ({})) as { status?: string; message?: string; debug?: string };
        if (!response.ok || payload.status === 'error') {
            throw new Error(getErrorMessage(fallbackMessage, payload));
        }

        return payload;
    };

    const maybeNotifyRoomChanges = useCallback((nextRooms: Room[]) => {
        if (!user || user.role !== 'guru') {
            previousRoomsRef.current = nextRooms;
            hasHydratedRoomsRef.current = true;
            return;
        }

        if (!hasHydratedRoomsRef.current) {
            previousRoomsRef.current = nextRooms;
            hasHydratedRoomsRef.current = true;
            return;
        }

        const previousVisibleRooms = previousRoomsRef.current.filter((room) => room.category === portalType);
        const nextVisibleRooms = nextRooms.filter((room) => room.category === portalType);

        const previousItems = new Map(flattenRoomItems(previousVisibleRooms).map((item) => [item.id, item]));

        flattenRoomItems(nextVisibleRooms).forEach((item) => {
            const previous = previousItems.get(item.id);
            if (!previous) return;

            const wasInMaintenance = previous.status === 'maintenance';
            const isInMaintenance = item.status === 'maintenance';

            if (!wasInMaintenance && isInMaintenance) {
                const message = `${item.name} di ${item.roomName} masuk maintenance/service.`;
                showToast(`Item masuk maintenance: ${message}`, 'warning');
                addNotification({
                    title: 'Item Masuk Maintenance',
                    message,
                    type: 'warning'
                });
            }
        });

        previousRoomsRef.current = nextRooms;
    }, [addNotification, portalType, showToast, user]);

    const fetchRooms = useCallback(async (showLoading = true) => {
        if (showLoading) {
            setLoading(true);
        }

        try {
            const response = await fetch(ROOMS_ENDPOINT, {
                headers: getAuthHeaders()
            });
            if (response.status === 401) {
                logout();
                throw new Error('Sesi Anda telah berakhir. Silakan login kembali.');
            }
            if (!response.ok) throw new Error('Failed to fetch inventory');
            const data = await response.json() as unknown;
            const normalizedRooms = normalizeRooms(data);
            maybeNotifyRoomChanges(normalizedRooms);
            setRooms(normalizedRooms);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Gagal memuat data inventory.');
        } finally {
            if (showLoading) {
                setLoading(false);
            }
        }
    }, [logout, maybeNotifyRoomChanges]);

    useEffect(() => {
        if (!isAuthenticated || !getAuthToken()) {
            setRooms([]);
            setLoading(false);
            previousRoomsRef.current = [];
            hasHydratedRoomsRef.current = false;
            return;
        }

        void fetchRooms();
    }, [fetchRooms, isAuthenticated, user?.id]);

    useEffect(() => {
        if (!isAuthenticated || !getAuthToken()) return;

        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            void fetchRooms(false).catch((error) => {
                console.error('Failed to auto-refresh inventory:', error);
            });
        }, 15000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [fetchRooms, isAuthenticated]);

    // Filter rooms based on active portal
    const filteredRooms = useMemo(() => rooms.filter(r => r.category === portalType), [rooms, portalType]);

    // Derived Stats
    const stats: InventoryStats = {
        totalRooms: filteredRooms.length,
        totalAssets: 0,
        health: { good: 0, maintenance: 0, broken: 0, in_use: 0 },
        grading: 100
    };

    const recentLogs: { roomId: string; roomName: string; itemName: string; log: ItemLog }[] = [];

    // Calculate Stats & Collect Logs (using filtered rooms)
    filteredRooms.forEach(room => {
        room.containers?.forEach(container => {
            container.items?.forEach(item => {
                stats.totalAssets++;
                if (item.status && item.status in stats.health) {
                    stats.health[item.status as keyof typeof stats.health]++;
                } else {
                    stats.health.good++; // Fallback
                }

                // Collect logs
                if (item.logs) {
                    item.logs.forEach(log => {
                        recentLogs.push({
                            roomId: room.id,
                            roomName: room.name,
                            itemName: item.name,
                            log
                        });
                    });
                }
            });
        });
    });

    // Sort logs by date desc
    recentLogs.sort((a, b) => new Date(b.log.date).getTime() - new Date(a.log.date).getTime());

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
                        capacity: room.capacity ?? 0,
                        roomOwner: room.roomOwner ?? null
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
                        capacity: room.capacity ?? 0,
                        roomOwner: room.roomOwner ?? null
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

    const updateRoom = async (updatedRoom: Room) => {
        setRooms(prev => prev.map(r => r.id === updatedRoom.id ? updatedRoom : r));
        try {
            await persistRoomState(updatedRoom);
            await fetchRooms(false);
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

    // Basic item types support (for the new "manage item type, labels in detail" model)
    const fetchItemTypes = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/inventory/item_types.php`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (response.ok && data.status === 'success') {
                setItemTypes(data.item_types || []);
            }
        } catch (e) {
            // non-fatal for now
            console.warn('Could not load item types', e);
        }
    }, [API_BASE_URL, getAuthHeaders]);

    const refreshItemTypes = useCallback(async () => {
        await fetchItemTypes();
    }, [fetchItemTypes]);

    const getItemTypeById = (id: string) => itemTypes.find((t: any) => t.id === id || t.id == id);

    // Optimistic + immediate create for item types (no polling, instant reactivity across the app)
    const createItemType = useCallback(async (data: { name: string; type?: string; category?: string; specs?: string; parameters?: any[] }) => {
        const payload = {
            action: 'create',
            name: data.name.trim(),
            type: data.type?.trim() || 'General',
            category: data.category || null,
            specs: data.specs || '',
            parameters: data.parameters || []
        };

        const res = await requestMutation(
            `${API_BASE_URL}/inventory/item_types.php`,
            { method: 'POST', body: JSON.stringify(payload) },
            'Gagal menambahkan tipe item.'
        ) as any;

        const newType = {
            id: res.id ?? Date.now(),
            name: payload.name,
            type: payload.type,
            category: payload.category,
            specs: payload.specs,
            parameters: payload.parameters,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        setItemTypes(prev => {
            const next = [...prev, newType];
            // Cross-tab sync (no polling, instant in other tabs of same user)
            try {
                const bc = new BroadcastChannel('inventory-data-sync');
                bc.postMessage({ type: 'itemTypesUpdated', payload: next });
                bc.close();
            } catch {
                // ignore BroadcastChannel errors (e.g. not supported)
            }
            return next;
        });

        return newType;
    }, [API_BASE_URL, requestMutation]);

    // Categories (for central management in Manajemen Barang)
    const [categories, setCategories] = useState<any[]>([]);

    const fetchCategories = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/inventory/categories.php`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            if (response.ok && data.status === 'success') {
                setCategories(data.categories || []);
            }
        } catch (e) {
            console.warn('Could not load categories', e);
        }
    }, [API_BASE_URL, getAuthHeaders]);

    const refreshCategories = useCallback(async () => {
        await fetchCategories();
    }, [fetchCategories]);

    const createCategory = useCallback(async (name: string) => {
        const payload = { action: 'create', name: name.trim() };

        const res = await requestMutation(
            `${API_BASE_URL}/inventory/categories.php`,
            { method: 'POST', body: JSON.stringify(payload) },
            'Gagal menambahkan kategori.'
        ) as any;

        const newCat = {
            id: res.id ?? Date.now(),
            name: name.trim(),
            created_at: new Date().toISOString(),
        };

        setCategories(prev => {
            const next = [...prev, newCat];
            try {
                const bc = new BroadcastChannel('inventory-data-sync');
                bc.postMessage({ type: 'categoriesUpdated', payload: next });
                bc.close();
            } catch (e) {
                void e;
            }
            return next;
        });

        return newCat;
    }, [API_BASE_URL, requestMutation]);

    const deleteCategory = useCallback(async (id: number | string) => {
        const payload = { action: 'delete', id };

        await requestMutation(
            `${API_BASE_URL}/inventory/categories.php`,
            { method: 'POST', body: JSON.stringify(payload) },
            'Gagal menghapus kategori.'
        );

        setCategories(prev => {
            const next = prev.filter((c: any) => c.id != id);
            try {
                const bc = new BroadcastChannel('inventory-data-sync');
                bc.postMessage({ type: 'categoriesUpdated', payload: next });
                bc.close();
            } catch (e) {
                void e;
            }
            return next;
        });
    }, [API_BASE_URL, requestMutation]);

    useEffect(() => {
        if (isAuthenticated) {
            void fetchItemTypes();
            void fetchCategories();
        }
    }, [isAuthenticated]);

    // Listen for cross-tab updates (BroadcastChannel) so changes in one tab instantly appear in others without refresh or polling
    useEffect(() => {
        let bc: BroadcastChannel | null = null;
        try {
            bc = new BroadcastChannel('inventory-data-sync');
            bc.onmessage = (ev) => {
                const msg = ev.data || {};
                if (msg.type === 'itemTypesUpdated' && Array.isArray(msg.payload)) {
                    setItemTypes(msg.payload);
                }
                if (msg.type === 'categoriesUpdated' && Array.isArray(msg.payload)) {
                    setCategories(msg.payload);
                }
                // Future: can handle rooms patches etc.
            };
        } catch (e) {
            void e;
        }
        return () => {
            bc?.close();
        };
    }, []);

    const handleRealtimeEvent = useCallback((data: any) => {
        if (!data || !data.type) return;
        const { type } = data;

        switch (type) {
            case 'category_created':
            case 'category_deleted':
                // Refresh the central categories list so dropdowns in MB and add-item forms update everywhere
                void refreshCategories();
                break;

            case 'item_type_created':
            case 'item_type_deleted':
                void refreshItemTypes();
                break;

            case 'container_item_changed':
                // Key for labels/instances: when one actor adds/edits a label in a container,
                // other views (MB labels list, other containers, dashboards) auto see it.
                // Use silent refresh to avoid loading spinners.
                void fetchRooms(false);
                break;

            default:
                // Unknown event - safe full silent rooms refresh as catch-all for "semua data"
                void fetchRooms(false);
                break;
        }
    }, [refreshCategories, refreshItemTypes, fetchRooms]);

    // === Real-time SSE for cross-user / cross-session auto sync (no client polling, no manual refresh) ===
    // When any client mutates data (category, item_type, container item), backend logs to inventory_events.
    // All connected clients receive push via SSE and update their context state immediately.
    const lastEventIdRef = useRef<number>(0);
    useEffect(() => {
        if (!isAuthenticated) return;

        let es: EventSource | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

        const connectSSE = () => {
            if (es) {
                es.close();
            }
            const url = `${API_BASE_URL}/inventory/events.php?last_id=${lastEventIdRef.current}`;
            try {
                es = new EventSource(url);
            } catch (e) {
                // EventSource not supported or other init error - graceful fallback, no user spam
                console.warn('SSE init failed, real-time sync disabled in this browser:', e);
                return;
            }

            es.onmessage = (ev) => {
                try {
                    const data = JSON.parse(ev.data || '{}');
                    if (data && typeof data.id === 'number') {
                        lastEventIdRef.current = Math.max(lastEventIdRef.current, data.id);
                    }
                    handleRealtimeEvent(data);
                } catch (parseErr) {
                    console.warn('SSE parse error', parseErr);
                }
            };

            es.onerror = () => {
                // Silent reconnect (no "failed to fetch" toasts to user)
                if (es) {
                    es.close();
                    es = null;
                }
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(connectSSE, 3000);
            };
        };

        connectSSE();

        return () => {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (es) es.close();
        };
    }, [isAuthenticated, API_BASE_URL, handleRealtimeEvent]);

    // === Preventive Maintenance log persistence (accurate, via item_logs) ===
    const appendLogLocally = useCallback((itemId: string, log: ItemLog) => {
        setRooms(prev => prev.map(room => ({
            ...room,
            containers: room.containers.map(container => ({
                ...container,
                items: container.items.map(item =>
                    item.id === itemId
                        ? { ...item, logs: [log, ...(item.logs || [])] }
                        : item
                )
            }))
        })));
    }, [setRooms]);

    const schedulePreventiveMaintenance = useCallback(async (
        itemId: string,
        recommendedDate: string,
        reason: string,
        source: 'ai' | 'manual'
    ) => {
        const payload = {
            action: 'schedule',
            itemId,
            recommendedDate,
            reason: reason.trim(),
            source
        };

        const res = await fetch(`${API_BASE_URL}/inventory/preventive_maintenance.php`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to schedule preventive maintenance');
        }

        const log: ItemLog = {
            id: `pm-sched-${Date.now()}`,
            date: new Date().toISOString(),
            action: 'PREVENTIVE_MAINTENANCE_SCHEDULED',
            details: JSON.stringify({ recommendedDate, reason: reason.trim(), source })
        };

        appendLogLocally(itemId, log);
    }, [API_BASE_URL, appendLogLocally, getAuthHeaders]);

    const completePreventiveMaintenance = useCallback(async (itemId: string) => {
        const res = await fetch(`${API_BASE_URL}/inventory/preventive_maintenance.php`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ action: 'complete', itemId })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to complete');
        }

        const log: ItemLog = {
            id: `pm-comp-${Date.now()}`,
            date: new Date().toISOString(),
            action: 'PREVENTIVE_MAINTENANCE_COMPLETED',
            details: JSON.stringify({ completedAt: new Date().toISOString() })
        };

        appendLogLocally(itemId, log);

        // Reflect completion accurately: reset condition/status to good if it was in maintenance
        setRooms(prev => prev.map(room => ({
            ...room,
            containers: room.containers.map(cont => ({
                ...cont,
                items: cont.items.map(it =>
                    it.id === itemId && (it.condition === 'service' || it.status === 'maintenance')
                        ? { ...it, condition: 'good' as ComponentCondition, status: 'good' as ComponentStatus }
                        : it
                )
            }))
        })));
    }, [API_BASE_URL, appendLogLocally, getAuthHeaders, setRooms]);

    const cancelPreventiveMaintenance = useCallback(async (itemId: string, cancelReason: string) => {
        const res = await fetch(`${API_BASE_URL}/inventory/preventive_maintenance.php`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ action: 'cancel', itemId, cancelReason: cancelReason.trim() })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to cancel');
        }

        const log: ItemLog = {
            id: `pm-cancel-${Date.now()}`,
            date: new Date().toISOString(),
            action: 'PREVENTIVE_MAINTENANCE_CANCELLED',
            details: JSON.stringify({ cancelReason: cancelReason.trim(), cancelledAt: new Date().toISOString() })
        };

        appendLogLocally(itemId, log);
    }, [API_BASE_URL, appendLogLocally, getAuthHeaders]);
    // === END preventive methods ===

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
        schedulePreventiveMaintenance,
        completePreventiveMaintenance,
        cancelPreventiveMaintenance,
        itemTypes,
        refreshItemTypes,
        getItemTypeById,
        createItemType,
        categories,
        refreshCategories,
        createCategory,
        deleteCategory,
        stats,
        recentLogs,
        loading,
        error
    }), [
        filteredRooms,
        stats,
        recentLogs,
        loading,
        error,
        schedulePreventiveMaintenance,
        completePreventiveMaintenance,
        cancelPreventiveMaintenance,
        itemTypes,
        createItemType,
        categories,
        createCategory,
        deleteCategory
    ]);

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
