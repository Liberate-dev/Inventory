import { createContext, useContext, useState, type ReactNode } from 'react';
import type { UserRole } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────
export type AccessLevel = 'full' | 'view' | 'none';

/** A unique key for each protected feature */
export type FeatureKey =
    | 'dashboard'
    | 'rooms'
    | 'service_requests'
    | 'operations'
    | 'reports'
    | 'user_management';

export type AccessMatrix = Record<FeatureKey, Record<UserRole, AccessLevel>>;

// ── Default Matrix ────────────────────────────────────────────────────────────
export const DEFAULT_MATRIX: AccessMatrix = {
    dashboard: { admin: 'full', kepala_lab: 'full', guru: 'full', kepala_sekolah: 'full', sarpras: 'full' },
    rooms: { admin: 'full', kepala_lab: 'full', guru: 'full', kepala_sekolah: 'view', sarpras: 'view' },
    service_requests: { admin: 'full', kepala_lab: 'full', guru: 'full', kepala_sekolah: 'view', sarpras: 'full' },
    operations: { admin: 'full', kepala_lab: 'full', guru: 'full', kepala_sekolah: 'none', sarpras: 'none' },
    reports: { admin: 'full', kepala_lab: 'full', guru: 'none', kepala_sekolah: 'full', sarpras: 'full' },
    user_management: { admin: 'full', kepala_lab: 'none', guru: 'none', kepala_sekolah: 'none', sarpras: 'none' },
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
    dashboard: 'Dashboard',
    rooms: 'Ruangan & Inventaris',
    service_requests: 'Permintaan Layanan',
    operations: 'Operasional',
    reports: 'Laporan Bulanan',
    user_management: 'Manajemen Pengguna',
};

const STORAGE_KEY = 'inventory_access_matrix';

function loadMatrix(): AccessMatrix {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_MATRIX;
        const parsed = JSON.parse(raw) as Partial<AccessMatrix>;
        // Merge with defaults so new features always have a value
        const merged: AccessMatrix = { ...DEFAULT_MATRIX };
        for (const key of Object.keys(DEFAULT_MATRIX) as FeatureKey[]) {
            if (parsed[key]) {
                merged[key] = { ...DEFAULT_MATRIX[key], ...parsed[key] };
            }
        }
        return merged;
    } catch {
        return DEFAULT_MATRIX;
    }
}

// ── Context ───────────────────────────────────────────────────────────────────
interface AccessMatrixContextType {
    matrix: AccessMatrix;
    getAccess: (feature: FeatureKey, role: UserRole) => AccessLevel;
    /** canSee: role has 'full' or 'view' access */
    canSee: (feature: FeatureKey, role: UserRole) => boolean;
    /** canEdit: role has 'full' access */
    canEditFeature: (feature: FeatureKey, role: UserRole) => boolean;
    setAccess: (feature: FeatureKey, role: UserRole, level: AccessLevel) => void;
    resetMatrix: () => void;
}

const AccessMatrixContext = createContext<AccessMatrixContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────
export const AccessMatrixProvider = ({ children }: { children: ReactNode }) => {
    const [matrix, setMatrix] = useState<AccessMatrix>(loadMatrix);

    const getAccess = (feature: FeatureKey, role: UserRole): AccessLevel =>
        matrix[feature]?.[role] ?? 'none';

    const canSee = (feature: FeatureKey, role: UserRole): boolean =>
        getAccess(feature, role) !== 'none';

    const canEditFeature = (feature: FeatureKey, role: UserRole): boolean =>
        getAccess(feature, role) === 'full';

    const setAccess = (feature: FeatureKey, role: UserRole, level: AccessLevel) => {
        setMatrix(prev => {
            const next = {
                ...prev,
                [feature]: { ...prev[feature], [role]: level }
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    const resetMatrix = () => {
        localStorage.removeItem(STORAGE_KEY);
        setMatrix(DEFAULT_MATRIX);
    };

    return (
        <AccessMatrixContext.Provider value={{ matrix, getAccess, canSee, canEditFeature, setAccess, resetMatrix }}>
            {children}
        </AccessMatrixContext.Provider>
    );
};

// ── Hook ──────────────────────────────────────────────────────────────────────
export const useAccessMatrix = () => {
    const ctx = useContext(AccessMatrixContext);
    if (!ctx) throw new Error('useAccessMatrix must be used within AccessMatrixProvider');
    return ctx;
};
