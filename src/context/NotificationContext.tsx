import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type AppNotificationType = 'success' | 'error' | 'warning' | 'info';

export interface AppNotification {
    id: string;
    title: string;
    message: string;
    type: AppNotificationType;
    createdAt: string;
    read: boolean;
}

interface NotificationContextType {
    notifications: AppNotification[];
    unreadCount: number;
    addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const getStorageKey = (userId: string) => `inventory_notifications_${userId}`;

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);

    useEffect(() => {
        if (!user?.id) {
            setNotifications([]);
            return;
        }

        try {
            const saved = localStorage.getItem(getStorageKey(user.id));
            if (!saved) {
                setNotifications([]);
                return;
            }

            const parsed = JSON.parse(saved) as AppNotification[];
            if (!Array.isArray(parsed)) {
                setNotifications([]);
                return;
            }

            setNotifications(parsed);
        } catch {
            setNotifications([]);
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        localStorage.setItem(getStorageKey(user.id), JSON.stringify(notifications));
    }, [notifications, user?.id]);

    const addNotification = useCallback((notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => {
        setNotifications((prev) => [
            {
                id: crypto.randomUUID(),
                title: notification.title,
                message: notification.message,
                type: notification.type,
                createdAt: new Date().toISOString(),
                read: false
            },
            ...prev
        ].slice(0, 40));
    }, []);

    const markAsRead = useCallback((id: string) => {
        setNotifications((prev) => prev.map((notification) => (
            notification.id === id
                ? { ...notification, read: true }
                : notification
        )));
    }, []);

    const markAllAsRead = useCallback(() => {
        setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })));
    }, []);

    const clearNotifications = useCallback(() => {
        setNotifications([]);
    }, []);

    const unreadCount = useMemo(
        () => notifications.filter((notification) => !notification.read).length,
        [notifications]
    );

    const value = useMemo(() => ({
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotifications
    }), [addNotification, clearNotifications, markAllAsRead, markAsRead, notifications, unreadCount]);

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
};
