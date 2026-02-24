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
    { id: 'u2', username: 'admin1_kom', name: 'Admin 1 (Komputer)', email: 'admin1.kom@lab.com', phone: '081234567891', role: 'kepala_lab', labScope: 'computer', avatar: 'https://ui-avatars.com/api/?name=Admin+1&background=4f46e5&color=fff' },
    { id: 'u3', username: 'admin1_bio', name: 'Admin 1 (Biologi)', email: 'admin1.bio@lab.com', phone: '081234567892', role: 'kepala_lab', labScope: 'biology', avatar: 'https://ui-avatars.com/api/?name=Admin+1&background=16a34a&color=fff' },
    { id: 'u4', username: 'admin1_fis', name: 'Admin 1 (Fisika)', email: 'admin1.fis@lab.com', phone: '081234567893', role: 'kepala_lab', labScope: 'physics', avatar: 'https://ui-avatars.com/api/?name=Admin+1&background=ca8a04&color=fff' },
    { id: 'u5', username: 'admin2', name: 'Admin 2', email: 'admin2@lab.com', phone: '081234567894', role: 'guru', avatar: 'https://ui-avatars.com/api/?name=Admin+2&background=0891b2&color=fff' },
    { id: 'u6', username: 'kepsek', name: 'Kepala Sekolah', email: 'kepsek@lab.com', phone: '081234567895', role: 'kepala_sekolah', avatar: 'https://ui-avatars.com/api/?name=Kepsek&background=475569&color=fff' },
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
        try {
            const response = await fetch('http://localhost:8000/api/auth/login.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username: identifier, password }),
            });

            const data = await response.json();

            if (data.success) {
                setUser(data.user);
                localStorage.setItem('auth_token', data.token); // Store token
                return { success: true };
            } else {
                return { success: false, error: data.message };
            }
        } catch (error) {
            console.error("Login error:", error);
            return {
                success: false,
                error: "Gagal terhubung ke server. Pastikan backend (PHP) berjalan."
            };
        }
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
