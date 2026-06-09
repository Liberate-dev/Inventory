import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ServiceRequest, RequestStatus } from '../types';
import { useAuth } from './AuthContext';
import { getAuthHeaders, getAuthToken } from '../utils/api';
import { useToast } from './ToastContext';
import { useNotifications } from './NotificationContext';
import { usePortal } from './PortalContext';

interface ServiceRequestContextType {
    requests: ServiceRequest[];
    addRequest: (request: Omit<ServiceRequest, 'id' | 'requestDate' | 'status'>) => Promise<void>;
    updateRequestStatus: (
        id: string,
        status: RequestStatus,
        rejectionReason?: string,
        resolutionOutcome?: 'repaired' | 'broken',
        note?: string
    ) => Promise<void>;
    getRequestsByRoom: (roomId: string) => ServiceRequest[];
    refreshRequests: () => Promise<void>;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api').replace(/\/+$/, '');
const REQUESTS_ENDPOINT = `${API_BASE_URL}/service_requests/requests.php`;

const ServiceRequestContext = createContext<ServiceRequestContextType | undefined>(undefined);

export const ServiceRequestProvider = ({ children }: { children: ReactNode }) => {
    const { user, isAuthenticated, logout } = useAuth();
    const { portalType } = usePortal();
    const { showToast } = useToast();
    const { addNotification } = useNotifications();
    const [requests, setRequests] = useState<ServiceRequest[]>([]);
    const previousRequestsRef = useRef<ServiceRequest[]>([]);
    const hasHydratedRequestsRef = useRef(false);

    const toPositiveIntString = (value: unknown): string | null => {
        if (value === null || value === undefined) return null;
        const text = String(value).trim();
        if (!/^\d+$/.test(text)) return null;
        const number = Number.parseInt(text, 10);
        if (!Number.isFinite(number) || number <= 0) return null;
        return String(number);
    };

    const getSessionUserFallback = () => {
        try {
            const raw = localStorage.getItem('auth_user');
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Partial<{ id: string; username: string; email: string; name: string }>;
            return parsed;
        } catch {
            return null;
        }
    };

    const resolveRequesterId = (): string | null => {
        const direct = toPositiveIntString(user?.id);
        if (direct) return direct;

        const fallback = getSessionUserFallback();
        const fallbackId = toPositiveIntString(fallback?.id);
        if (fallbackId) return fallbackId;
        return null;
    };

    const resolveRequesterName = (provided?: string): string | null => {
        if (user?.name && user.name.trim() !== '') return user.name.trim();
        const fallback = getSessionUserFallback();
        if (typeof fallback?.name === 'string' && fallback.name.trim() !== '') return fallback.name.trim();
        if (typeof provided === 'string' && provided.trim() !== '') return provided.trim();
        return null;
    };

    const maybeNotifyRequestChanges = useCallback((nextRequests: ServiceRequest[]) => {
        if (!user) return;

        const previousRequests = previousRequestsRef.current;
        if (!hasHydratedRequestsRef.current) {
            previousRequestsRef.current = nextRequests;
            hasHydratedRequestsRef.current = true;
            return;
        }

        const previousMap = new Map(previousRequests.map((request) => [request.id, request]));

        if (user.role === 'sarpras') {
            nextRequests
                .filter((request) => !previousMap.has(request.id))
                .forEach((request) => {
                    const message = `${request.componentName} di ${request.roomName || request.stationName || 'lokasi tidak diketahui'}`;
                    showToast(
                        `Service request baru: ${message}`,
                        'warning'
                    );
                    addNotification({
                        title: 'Service Request Baru',
                        message,
                        type: 'warning'
                    });
                });
        }

        if (user.role === 'kepala_lab') {
            nextRequests.forEach((request) => {
                const previous = previousMap.get(request.id);
                if (!previous || previous.status === request.status) return;

                if (request.status === 'accepted') {
                    const message = `Permintaan layanan untuk ${request.componentName} telah diterima.`;
                    showToast(message, 'success');
                    addNotification({
                        title: 'Permintaan Diterima',
                        message,
                        type: 'success'
                    });
                }

                if (request.status === 'denied') {
                    const message = `Permintaan layanan untuk ${request.componentName} telah ditolak.`;
                    showToast(message, 'error');
                    addNotification({
                        title: 'Permintaan Ditolak',
                        message,
                        type: 'error'
                    });
                }
            });
        }

        previousRequestsRef.current = nextRequests;
    }, [addNotification, showToast, user]);

    const fetchRequests = useCallback(async () => {
        const url = `${REQUESTS_ENDPOINT}?portalType=${encodeURIComponent(portalType)}`;
        const response = await fetch(url, {
            headers: getAuthHeaders()
        });
        if (response.status === 401) {
            logout();
            throw new Error('Sesi Anda telah berakhir. Silakan login kembali.');
        }
        const payload = await response.json().catch(() => ({})) as {
            status?: string;
            message?: string;
            requests?: unknown;
        };

        if (!response.ok || payload.status === 'error') {
            throw new Error(payload.message || 'Gagal memuat service requests.');
        }

        const raw = Array.isArray(payload.requests) ? payload.requests : [];
        const normalized = raw
            .map((value) => {
                if (typeof value !== 'object' || value === null) return null;
                const entry = value as Partial<ServiceRequest> & Record<string, unknown>;
                return {
                    id: String(entry.id ?? ''),
                    componentId: String(entry.componentId ?? ''),
                    componentName: String(entry.componentName ?? 'Unknown Component'),
                    stationId: String(entry.stationId ?? ''),
                    stationName: String(entry.stationName ?? 'Unknown Station'),
                    roomId: String(entry.roomId ?? ''),
                    roomName: typeof entry.roomName === 'string' ? entry.roomName : undefined,
                    description: String(entry.description ?? ''),
                    requesterName: typeof entry.requesterName === 'string' ? entry.requesterName : undefined,
                    componentSku: typeof entry.componentSku === 'string' ? entry.componentSku : undefined,
                    componentCategory: typeof entry.componentCategory === 'string' ? entry.componentCategory : undefined,
                    status: (entry.status as RequestStatus) ?? 'pending',
                    requestDate: String(entry.requestDate ?? new Date().toISOString()),
                    resolutionDate: typeof entry.resolutionDate === 'string' ? entry.resolutionDate : undefined,
                    rejectionReason: typeof entry.rejectionReason === 'string' ? entry.rejectionReason : undefined,
                    resolutionOutcome: entry.resolutionOutcome === 'repaired' || entry.resolutionOutcome === 'broken'
                        ? entry.resolutionOutcome
                        : undefined
                } as ServiceRequest;
            })
            .filter((entry): entry is ServiceRequest => entry !== null);

        maybeNotifyRequestChanges(normalized);
        setRequests(normalized);
    }, [logout, maybeNotifyRequestChanges, portalType]);

    useEffect(() => {
        if (!isAuthenticated || !getAuthToken()) {
            setRequests([]);
            previousRequestsRef.current = [];
            hasHydratedRequestsRef.current = false;
            return;
        }

        void fetchRequests().catch((error) => {
            console.error('Failed to load service requests:', error);
        });
    }, [fetchRequests, isAuthenticated, user?.id]);

    useEffect(() => {
        if (!isAuthenticated || !getAuthToken()) return;

        const intervalId = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            void fetchRequests().catch((error) => {
                console.error('Failed to auto-refresh service requests:', error);
            });
        }, 15000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [fetchRequests, isAuthenticated]);

    const addRequest = async (newRequest: Omit<ServiceRequest, 'id' | 'requestDate' | 'status'>) => {
        const requesterId = resolveRequesterId();
        const requesterName = resolveRequesterName(newRequest.requesterName);

        const response = await fetch(REQUESTS_ENDPOINT, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                componentId: newRequest.componentId,
                description: newRequest.description,
                requesterId,
                requesterName
            })
        });

        const payload = await response.json().catch(() => ({})) as { status?: string; message?: string };
        if (!response.ok || payload.status === 'error') {
            throw new Error(payload.message || 'Gagal menambah service request.');
        }

        await fetchRequests();
    };

    const updateRequestStatus = async (
        id: string,
        status: RequestStatus,
        rejectionReason?: string,
        resolutionOutcome?: 'repaired' | 'broken',
        note?: string
    ) => {
        const response = await fetch(REQUESTS_ENDPOINT, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                id,
                status,
                rejectionReason: status === 'denied' ? (rejectionReason ?? '') : null,
                resolutionOutcome: status === 'completed' ? (resolutionOutcome ?? null) : null,
                note: typeof note === 'string' ? note.trim() : null
            })
        });

        const payload = await response.json().catch(() => ({})) as { status?: string; message?: string };
        if (!response.ok || payload.status === 'error') {
            throw new Error(payload.message || 'Gagal memperbarui status request.');
        }

        await fetchRequests();
    };

    const getRequestsByRoom = (roomId: string) => {
        return requests.filter((req) => req.roomId === roomId);
    };

    return (
        <ServiceRequestContext.Provider
            value={{
                requests,
                addRequest,
                updateRequestStatus,
                getRequestsByRoom,
                refreshRequests: fetchRequests
            }}
        >
            {children}
        </ServiceRequestContext.Provider>
    );
};

export const useServiceRequests = () => {
    const context = useContext(ServiceRequestContext);
    if (!context) {
        throw new Error('useServiceRequests must be used within a ServiceRequestProvider');
    }
    return context;
};
