import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getAuthHeaders } from '../utils/api';

export type PortalType = 'lab' | 'non-lab';

interface PortalContextType {
    portalType: PortalType;
    setPortalType: (type: PortalType) => void;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/public/api').replace(/\/+$/, '');
const PREFERENCES_ENDPOINT = `${API_BASE_URL}/preferences/preferences.php`;

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export const PortalProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth();
    const [portalType, setPortalTypeState] = useState<PortalType>(() => {
        const saved = localStorage.getItem('portal_type');
        return (saved as PortalType) || 'lab';
    });

    useEffect(() => {
        localStorage.setItem('portal_type', portalType);
    }, [portalType]);

    useEffect(() => {
        if (!user?.id) return;

        const loadPortalPreference = async () => {
            try {
                const response = await fetch(`${PREFERENCES_ENDPOINT}?user_id=${encodeURIComponent(user.id)}`, {
                    headers: getAuthHeaders()
                });
                const payload = await response.json().catch(() => ({})) as { status?: string; preferences?: { portalType?: string } };
                if (!response.ok || payload.status === 'error') return;

                const backendPortalType = payload.preferences?.portalType;
                if (backendPortalType === 'lab' || backendPortalType === 'non-lab') {
                    setPortalTypeState(backendPortalType);
                }
            } catch (error) {
                console.error('Failed to load portal preference:', error);
            }
        };

        void loadPortalPreference();
    }, [user?.id]);

    const setPortalType = (type: PortalType) => {
        setPortalTypeState(type);

        if (!user?.id) return;
        void fetch(PREFERENCES_ENDPOINT, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                userId: user.id,
                portalType: type
            })
        }).catch((error) => {
            console.error('Failed to sync portal preference:', error);
        });
    };

    return (
        <PortalContext.Provider value={{ portalType, setPortalType }}>
            {children}
        </PortalContext.Provider>
    );
};

export const usePortal = () => {
    const context = useContext(PortalContext);
    if (!context) {
        throw new Error('usePortal must be used within a PortalProvider');
    }
    return context;
};
