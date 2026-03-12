import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';

const getNotificationAccent = (type: 'success' | 'error' | 'warning' | 'info') => {
    if (type === 'success') return 'bg-emerald-500';
    if (type === 'error') return 'bg-rose-500';
    if (type === 'warning') return 'bg-amber-500';
    return 'bg-[#000080]';
};

const formatNotificationTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const NotificationBell = () => {
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearNotifications
    } = useNotifications();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
        };
    }, []);

    const latestNotifications = useMemo(() => notifications.slice(0, 8), [notifications]);

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-[#000080]"
                aria-label="Buka notifikasi"
                aria-expanded={open}
            >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full z-50 mt-3 w-[360px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                        <div>
                            <p className="text-sm font-bold text-slate-900">Notifikasi</p>
                            <p className="text-xs text-slate-500">{unreadCount} belum dibaca</p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={markAllAsRead}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Tandai semua dibaca"
                            >
                                <CheckCheck className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={clearNotifications}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600"
                                aria-label="Hapus semua notifikasi"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {latestNotifications.length === 0 ? (
                        <div className="px-4 py-10 text-center text-sm text-slate-500">
                            Belum ada notifikasi.
                        </div>
                    ) : (
                        <div className="max-h-[420px] overflow-y-auto p-2">
                            {latestNotifications.map((notification) => (
                                <button
                                    key={notification.id}
                                    type="button"
                                    onClick={() => markAsRead(notification.id)}
                                    className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                                        notification.read ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'
                                    }`}
                                >
                                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getNotificationAccent(notification.type)}`} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="text-sm font-semibold text-slate-900">{notification.title}</p>
                                            {!notification.read && (
                                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#000080]" />
                                            )}
                                        </div>
                                        <p className="mt-1 text-sm text-slate-600">{notification.message}</p>
                                        <p className="mt-2 text-xs text-slate-400">{formatNotificationTime(notification.createdAt)}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
