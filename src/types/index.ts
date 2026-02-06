// Types definition
export type ComponentCondition = 'good' | 'service' | 'damaged' | 'broken';
export type ComponentStatus = 'available' | 'in_use' | 'maintenance' | 'missing';

export type UserRole = 'admin' | 'kepala_lab' | 'guru' | 'kepala_sekolah' | 'sarpras';

export interface User {
    id: string;
    username: string; // New field
    email: string;
    name: string;
    phone?: string; // New field
    role: UserRole;
    avatar?: string;
    labScope?: 'computer' | 'biology' | 'physics' | 'all';
}

export interface ItemLog {
    id: string;
    date: string; // ISO string
    action: string; // e.g., "Added", "Reported", "Maintenance Accepted"
    details: string;
}

// Container Types
export type ContainerType = 'table' | 'cupboard' | 'shelf';

export interface Item {
    id: string;
    name: string;
    type: string;
    condition: 'good' | 'service' | 'damaged' | 'broken'; // Physical State
    status: 'available' | 'in_use' | 'maintenance' | 'missing'; // Availability status
    specs: string;
    image_layer?: string;
    logs: ItemLog[]; // History of the item
    // Extended Metadata (Phase 4)
    sku?: string; // Unique Inventory Code
    category?: string; // User-defined category
    isConsumable?: boolean; // Tracking flag
    quantity?: number; // Amount/Stock
    unit?: string; // Pcs, ml, g, etc.
    minStock?: number; // Reorder point
    parameters?: { label: string; value: string }[]; // Dynamic specs (Brand, S/N, etc.)
}

export type RequestStatus = 'pending' | 'accepted' | 'denied' | 'completed';

export interface ServiceRequest {
    id: string;
    componentId: string;
    componentName: string;
    stationId: string;
    stationName: string;
    roomId: string;
    description: string;
    requesterName?: string;
    componentSku?: string;
    componentCategory?: string;
    status: RequestStatus;
    requestDate: string;
    resolutionDate?: string;
    rejectionReason?: string;
}

export interface Container {
    id: string;
    name: string;
    type: 'table' | 'cupboard' | 'shelf';
    status: 'good' | 'warning' | 'error';
    items: Item[];
    position: { x: number; y: number }; // Grid coordinates
}

export interface Room {
    id: string;
    name: string;
    type: 'computer' | 'physics' | 'biology' | 'other';
    customType?: string;
    capacity: number;
    containers: Container[];
}
