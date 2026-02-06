import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../types';

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    allUsers: User[];
    login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
    registerUser: (newUser: Omit<User, 'id'>) => Promise<void>;
    updateUser: (id: string, data: Partial<User>) => void;
    deleteUser: (id: string) => void;
    updateProfile: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Initial Mock Users
const INITIAL_USERS: User[] = [
    { id: 'u1', username: 'admin', name: 'Super Admin', email: 'admin@lab.com', phone: '081234567890', role: 'admin', avatar: 'https://ui-avatars.com/api/?name=Super+Admin&background=dc2626&color=fff' },
    { id: 'u2', username: 'kalab_kom', name: 'Ka. Lab Komputer', email: 'kalab.kom@lab.com', phone: '081234567891', role: 'kepala_lab', labScope: 'computer', avatar: 'https://ui-avatars.com/api/?name=Ka+Lab+Kom&background=4f46e5&color=fff' },
    { id: 'u3', username: 'kalab_bio', name: 'Ka. Lab Biologi', email: 'kalab.bio@lab.com', phone: '081234567892', role: 'kepala_lab', labScope: 'biology', avatar: 'https://ui-avatars.com/api/?name=Ka+Lab+Bio&background=16a34a&color=fff' },
    { id: 'u4', username: 'kalab_fis', name: 'Ka. Lab Fisika', email: 'kalab.fis@lab.com', phone: '081234567893', role: 'kepala_lab', labScope: 'physics', avatar: 'https://ui-avatars.com/api/?name=Ka+Lab+Fis&background=ca8a04&color=fff' },
    { id: 'u5', username: 'guru', name: 'Guru Produktif', email: 'guru@lab.com', phone: '081234567894', role: 'guru', avatar: 'https://ui-avatars.com/api/?name=Guru+Prod&background=0891b2&color=fff' },
    { id: 'u6', username: 'kepsek', name: 'Kepala Sekolah', email: 'kepsek@lab.com', phone: '081234567895', role: 'kepala_sekolah', avatar: 'https://ui-avatars.com/api/?name=Kepala+Sekolah&background=475569&color=fff' },
    { id: 'u7', username: 'sarpras', name: 'Sarpras', email: 'sarpras@lab.com', phone: '081234567896', role: 'sarpras', avatar: 'https://ui-avatars.com/api/?name=Sarpras&background=ea580c&color=fff' },
];

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    // Current Session User
    const [user, setUser] = useState<User | null>(() => {
        const saved = localStorage.getItem('auth_user');
        return saved ? JSON.parse(saved) : null;
    });

    // Mock Database of All Users
    const [allUsers, setAllUsers] = useState<User[]>(() => {
        const savedDb = localStorage.getItem('auth_users_db');
        if (savedDb) {
            const parsed = JSON.parse(savedDb);
            // Simple check: if the first user doesn't have a username, the DB is stale. Reset it.
            if (parsed.length > 0 && !parsed[0].username) {
                return INITIAL_USERS;
            }
            return parsed;
        }
        return INITIAL_USERS;
    });

    // Persistence
    useEffect(() => {
        if (user) localStorage.setItem('auth_user', JSON.stringify(user));
        else localStorage.removeItem('auth_user');
    }, [user]);

    useEffect(() => {
        localStorage.setItem('auth_users_db', JSON.stringify(allUsers));
    }, [allUsers]);

    const login = async (identifier: string, password: string) => {
        return new Promise<{ success: boolean; error?: string }>((resolve) => {
            setTimeout(() => {
                // Determine user from "Database"
                const foundUser = allUsers.find(u =>
                    u.email?.toLowerCase() === identifier.toLowerCase() ||
                    (u.username && u.username.toLowerCase() === identifier.toLowerCase())
                );

                // Mock Password Check (In real app, hash check)
                const isValid = foundUser && (password === 'admin' || password === '123456');

                if (foundUser && isValid) {
                    setUser(foundUser);
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: 'Invalid credentials. Try "admin" or "123456"' });
                }
            }, 600);
        });
    };

    const logout = () => setUser(null);

    const registerUser = async (newUser: Omit<User, 'id'>) => {
        const id = `u-${Date.now()}`;
        const userToAdd: User = {
            ...newUser,
            id,
            avatar: newUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(newUser.name)}&background=random`
        };
        setAllUsers((prev: User[]) => [...prev, userToAdd]);
    };

    const updateUser = (id: string, data: Partial<User>) => {
        setAllUsers((prev: User[]) => prev.map(u => u.id === id ? { ...u, ...data } : u));
        // Update current session if it's the same user
        if (user?.id === id) setUser(prev => prev ? { ...prev, ...data } : null);
    };

    const deleteUser = (id: string) => {
        setAllUsers((prev: User[]) => prev.filter(u => u.id !== id));
    };

    const updateProfile = (data: Partial<User>) => {
        if (user) updateUser(user.id, data);
    };

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            allUsers,
            login,
            logout,
            registerUser,
            updateUser,
            deleteUser,
            updateProfile
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
