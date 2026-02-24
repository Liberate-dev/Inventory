import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../types';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    allUsers: User[];
    login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    registerUser: (newUser: Omit<User, 'id'>, password: string) => Promise<void>;
    updateUser: (id: string, data: Partial<User>, password?: string) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
    updateProfile: (data: Partial<User>) => Promise<void>;
    refreshUsers: () => Promise<void>;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/public/api').replace(/\/+$/, '');
const LOGIN_ENDPOINT = `${API_BASE_URL}/auth/login.php`;
const USERS_ENDPOINT = `${API_BASE_URL}/users/users.php`;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const withAvatarFallback = (user: User): User => ({
    ...user,
    avatar: user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.username || 'User')}&background=1e40af&color=fff`
});

const normalizeUser = (raw: Partial<User> & Record<string, unknown>): User => {
    const id = String(raw.id ?? '');
    const username = String(raw.username ?? '');
    const name = String(raw.name ?? '');
    const email = String(raw.email ?? '');
    const role = (raw.role ?? 'guru') as User['role'];

    return withAvatarFallback({
        id,
        username,
        name,
        email,
        role,
        phone: typeof raw.phone === 'string' ? raw.phone : undefined,
        avatar: typeof raw.avatar === 'string' ? raw.avatar : undefined,
        labScope: (raw.labScope as User['labScope']) ?? undefined
    });
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(() => {
        const saved = localStorage.getItem('auth_user');
        if (!saved) return null;

        try {
            return withAvatarFallback(JSON.parse(saved) as User);
        } catch {
            localStorage.removeItem('auth_user');
            return null;
        }
    });

    const [allUsers, setAllUsers] = useState<User[]>([]);

    const fetchUsers = async () => {
        const response = await fetch(USERS_ENDPOINT);
        const payload = await response.json().catch(() => ({})) as { status?: string; users?: unknown; message?: string };

        if (!response.ok || payload.status === 'error') {
            throw new Error(typeof payload.message === 'string' ? payload.message : 'Gagal memuat daftar user.');
        }

        const usersRaw = Array.isArray(payload.users) ? payload.users : [];
        const users = usersRaw
            .map((value) => {
                if (typeof value !== 'object' || value === null) return null;
                return normalizeUser(value as Partial<User> & Record<string, unknown>);
            })
            .filter((value): value is User => value !== null);

        setAllUsers(users);

        // keep current session in sync with backend version
        if (user) {
            const refreshedCurrent = users.find((u) => u.id === user.id);
            if (refreshedCurrent) {
                setUser(refreshedCurrent);
            }
        }
    };

    useEffect(() => {
        void fetchUsers().catch((error) => {
            console.error('Failed to fetch users:', error);
        });
    }, []);

    useEffect(() => {
        if (user) {
            localStorage.setItem('auth_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('auth_user');
        }
    }, [user]);

    const login = async (identifier: string, password: string) => {
        try {
            const response = await fetch(LOGIN_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: identifier, password })
            });

            const data = await response.json().catch(() => ({})) as {
                success?: boolean;
                message?: string;
                token?: string;
                user?: Partial<User> & Record<string, unknown>;
            };

            if (!response.ok || !data.success || !data.user) {
                return { success: false, error: data.message || 'Login gagal.' };
            }

            const loggedInUser = normalizeUser(data.user);
            setUser(loggedInUser);

            if (typeof data.token === 'string' && data.token) {
                localStorage.setItem('auth_token', data.token);
            }

            await fetchUsers().catch((error) => {
                console.error('Failed to refresh users after login:', error);
            });
            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                error: 'Gagal terhubung ke server. Pastikan backend (PHP) berjalan.'
            };
        }
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('auth_token');
    };

    const registerUser = async (newUser: Omit<User, 'id'>, password: string) => {
        const response = await fetch(USERS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: newUser.username,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone ?? null,
                role: newUser.role,
                labScope: newUser.labScope ?? null,
                avatar: newUser.avatar ?? null,
                password
            })
        });

        const payload = await response.json().catch(() => ({})) as { status?: string; message?: string };
        if (!response.ok || payload.status === 'error') {
            throw new Error(payload.message || 'Gagal menambah user.');
        }

        await fetchUsers();
    };

    const updateUser = async (id: string, data: Partial<User>, password?: string) => {
        const requestBody: Record<string, unknown> = {
            id,
            ...data
        };
        if (password && password.trim().length > 0) {
            requestBody.password = password;
        }

        const response = await fetch(USERS_ENDPOINT, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const payload = await response.json().catch(() => ({})) as { status?: string; message?: string; user?: Partial<User> & Record<string, unknown> };
        if (!response.ok || payload.status === 'error') {
            throw new Error(payload.message || 'Gagal memperbarui user.');
        }

        if (payload.user) {
            const updatedUser = normalizeUser(payload.user);
            setAllUsers((prev) => prev.map((existing) => (existing.id === updatedUser.id ? updatedUser : existing)));
            if (user?.id === updatedUser.id) {
                setUser(updatedUser);
            }
            return;
        }

        await fetchUsers();
    };

    const deleteUser = async (id: string) => {
        const response = await fetch(USERS_ENDPOINT, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });

        const payload = await response.json().catch(() => ({})) as { status?: string; message?: string };
        if (!response.ok || payload.status === 'error') {
            throw new Error(payload.message || 'Gagal menghapus user.');
        }

        setAllUsers((prev) => prev.filter((existing) => existing.id !== id));
        if (user?.id === id) {
            logout();
        }
    };

    const updateProfile = async (data: Partial<User>) => {
        if (!user) return;
        await updateUser(user.id, data);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated: !!user,
                allUsers,
                login,
                logout,
                registerUser,
                updateUser,
                deleteUser,
                updateProfile,
                refreshUsers: fetchUsers
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
