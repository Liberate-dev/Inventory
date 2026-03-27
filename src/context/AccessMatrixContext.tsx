import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserRole } from '../types';
import { useAuth } from './AuthContext';
import { getAuthHeaders, getAuthToken } from '../utils/api';

export type AccessLevel = 'full' | 'view' | 'none';

export type FeatureKey =
    | 'dashboard'
    | 'rooms'
    | 'item_management'
    | 'service_requests'
    | 'operations'
    | 'reports'
    | 'print_assets'
    | 'user_management'
    | 'system_logs';

export type AccessMatrix = Record<FeatureKey, Record<UserRole, AccessLevel>>;

export const DEFAULT_MATRIX: AccessMatrix = {
    dashboard: { admin: 'full', kepala_lab: 'full', guru: 'full', kepala_sekolah: 'full', sarpras: 'full', admin_nl: 'full' },
    rooms: { admin: 'none', kepala_lab: 'full', guru: 'full', kepala_sekolah: 'view', sarpras: 'view', admin_nl: 'full' },
    item_management: { admin: 'none', kepala_lab: 'full', guru: 'full', kepala_sekolah: 'view', sarpras: 'view', admin_nl: 'full' },
    service_requests: { admin: 'none', kepala_lab: 'view', guru: 'view', kepala_sekolah: 'view', sarpras: 'full', admin_nl: 'view' },
    operations: { admin: 'none', kepala_lab: 'full', guru: 'full', kepala_sekolah: 'none', sarpras: 'none', admin_nl: 'full' },
    reports: { admin: 'none', kepala_lab: 'full', guru: 'none', kepala_sekolah: 'full', sarpras: 'full', admin_nl: 'full' },
    print_assets: { admin: 'none', kepala_lab: 'none', guru: 'none', kepala_sekolah: 'view', sarpras: 'full', admin_nl: 'none' },
    user_management: { admin: 'full', kepala_lab: 'none', guru: 'none', kepala_sekolah: 'none', sarpras: 'none', admin_nl: 'none' },
    system_logs: { admin: 'full', kepala_lab: 'none', guru: 'none', kepala_sekolah: 'none', sarpras: 'none', admin_nl: 'none' },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
    dashboard: 'Dashboard',
    rooms: 'Ruangan & Inventaris',
    item_management: 'Manajemen Barang',
    service_requests: 'Permintaan Layanan',
    operations: 'Operasional',
    reports: 'Laporan Bulanan',
    print_assets: 'Cetak Label, Kartu & Kode',
    user_management: 'Manajemen Pengguna',
    system_logs: 'Log Sistem',
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/public/api').replace(/\/+$/, '');
const ACCESS_MATRIX_ENDPOINT = `${API_BASE_URL}/access_matrix/matrix.php`;

const normalizeMatrix = (raw: unknown): AccessMatrix => {
    const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<AccessMatrix>;
    const next: AccessMatrix = { ...DEFAULT_MATRIX };

    for (const feature of Object.keys(DEFAULT_MATRIX) as FeatureKey[]) {
        next[feature] = { ...DEFAULT_MATRIX[feature] };
        const featureSource = source[feature];
        if (!featureSource || typeof featureSource !== 'object') continue;

        for (const role of Object.keys(DEFAULT_MATRIX[feature]) as UserRole[]) {
            const candidate = (featureSource as Partial<Record<UserRole, AccessLevel>>)[role];
            if (candidate === 'full' || candidate === 'view' || candidate === 'none') {
                next[feature][role] = role === 'admin' ? DEFAULT_MATRIX[feature][role] : candidate;
            }
        }
    }

    return next;
};

interface AccessMatrixContextType {
    matrix: AccessMatrix;
    loading: boolean;
    getAccess: (feature: FeatureKey, role: UserRole) => AccessLevel;
    canSee: (feature: FeatureKey, role: UserRole) => boolean;
    canEditFeature: (feature: FeatureKey, role: UserRole) => boolean;
    setAccess: (feature: FeatureKey, role: UserRole, level: AccessLevel) => Promise<void>;
    resetMatrix: () => Promise<void>;
    refreshMatrix: () => Promise<void>;
}

const AccessMatrixContext = createContext<AccessMatrixContextType | undefined>(undefined);

export const AccessMatrixProvider = ({ children }: { children: ReactNode }) => {
    const { isAuthenticated, user, logout } = useAuth();
    const [matrix, setMatrix] = useState<AccessMatrix>(DEFAULT_MATRIX);
    const [loading, setLoading] = useState(false);

    const refreshMatrix = async () => {
        if (!isAuthenticated || !getAuthToken()) {
            setMatrix(DEFAULT_MATRIX);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(ACCESS_MATRIX_ENDPOINT, {
                headers: getAuthHeaders()
            });
            if (response.status === 401) {
                logout();
                setMatrix(DEFAULT_MATRIX);
                return;
            }

            const payload = await response.json().catch(() => ({})) as { status?: string; matrix?: unknown; message?: string };
            if (!response.ok || payload.status === 'error') {
                throw new Error(payload.message || 'Gagal memuat matriks akses.');
            }

            setMatrix(normalizeMatrix(payload.matrix));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refreshMatrix().catch((error) => {
            console.error('Failed to load access matrix:', error);
            setMatrix(DEFAULT_MATRIX);
            setLoading(false);
        });
    }, [isAuthenticated, user?.id]);

    const getAccess = (feature: FeatureKey, role: UserRole): AccessLevel =>
        matrix[feature]?.[role] ?? 'none';

    const canSee = (feature: FeatureKey, role: UserRole): boolean =>
        getAccess(feature, role) !== 'none';

    const canEditFeature = (feature: FeatureKey, role: UserRole): boolean =>
        getAccess(feature, role) === 'full';

    const setAccess = async (feature: FeatureKey, role: UserRole, level: AccessLevel) => {
        const response = await fetch(ACCESS_MATRIX_ENDPOINT, {
            method: 'PUT',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ feature, role, level })
        });
        const payload = await response.json().catch(() => ({})) as { status?: string; matrix?: unknown; message?: string };

        if (!response.ok || payload.status === 'error') {
            throw new Error(payload.message || 'Gagal memperbarui matriks akses.');
        }

        setMatrix(normalizeMatrix(payload.matrix));
    };

    const resetMatrix = async () => {
        const response = await fetch(ACCESS_MATRIX_ENDPOINT, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ action: 'reset' })
        });
        const payload = await response.json().catch(() => ({})) as { status?: string; matrix?: unknown; message?: string };

        if (!response.ok || payload.status === 'error') {
            throw new Error(payload.message || 'Gagal mereset matriks akses.');
        }

        setMatrix(normalizeMatrix(payload.matrix));
    };

    return (
        <AccessMatrixContext.Provider value={{ matrix, loading, getAccess, canSee, canEditFeature, setAccess, resetMatrix, refreshMatrix }}>
            {children}
        </AccessMatrixContext.Provider>
    );
};

export const useAccessMatrix = () => {
    const ctx = useContext(AccessMatrixContext);
    if (!ctx) throw new Error('useAccessMatrix must be used within AccessMatrixProvider');
    return ctx;
};
