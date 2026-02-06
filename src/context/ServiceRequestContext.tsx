import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { ServiceRequest, RequestStatus } from '../types';

interface ServiceRequestContextType {
    requests: ServiceRequest[];
    addRequest: (request: Omit<ServiceRequest, 'id' | 'requestDate' | 'status'>) => void;
    updateRequestStatus: (id: string, status: RequestStatus, rejectionReason?: string) => void;
    getRequestsByRoom: (roomId: string) => ServiceRequest[];
}

const ServiceRequestContext = createContext<ServiceRequestContextType | undefined>(undefined);

export const ServiceRequestProvider = ({ children }: { children: ReactNode }) => {
    const [requests, setRequests] = useState<ServiceRequest[]>(() => {
        const saved = localStorage.getItem('serviceRequests');
        try {
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error('Failed to parse service requests', e);
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem('serviceRequests', JSON.stringify(requests));
    }, [requests]);

    const addRequest = (newRequest: Omit<ServiceRequest, 'id' | 'requestDate' | 'status'>) => {
        const request: ServiceRequest = {
            ...newRequest,
            id: `req-${Date.now()}`,
            status: 'pending',
            requestDate: new Date().toISOString(),
        };
        setRequests(prev => [request, ...prev]);
    };

    const updateRequestStatus = (id: string, status: RequestStatus, rejectionReason?: string) => {
        setRequests(prev => prev.map(req =>
            req.id === id
                ? {
                    ...req,
                    status,
                    resolutionDate: ['completed', 'denied'].includes(status) ? new Date().toISOString() : undefined,
                    rejectionReason: status === 'denied' ? rejectionReason : undefined
                }
                : req
        ));
    };

    const getRequestsByRoom = (roomId: string) => {
        return requests.filter(req => req.roomId === roomId);
    };

    return (
        <ServiceRequestContext.Provider value={{ requests, addRequest, updateRequestStatus, getRequestsByRoom }}>
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
