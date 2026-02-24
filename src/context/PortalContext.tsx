import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type PortalType = 'lab' | 'non-lab';

interface PortalContextType {
    portalType: PortalType;
    setPortalType: (type: PortalType) => void;
}

const PortalContext = createContext<PortalContextType | undefined>(undefined);

export const PortalProvider = ({ children }: { children: ReactNode }) => {
    const [portalType, setPortalType] = useState<PortalType>(() => {
        const saved = localStorage.getItem('portal_type');
        return (saved as PortalType) || 'lab';
    });

    useEffect(() => {
        localStorage.setItem('portal_type', portalType);
    }, [portalType]);

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
