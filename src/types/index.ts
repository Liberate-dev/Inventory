export type ComponentStatus = 'good' | 'in_use' | 'maintenance' | 'broken';
export type ComponentCondition = 'good' | 'service' | 'damaged' | 'broken';

export type UserRole = 'admin' | 'kepala_lab' | 'guru' | 'kepala_sekolah' | 'sarpras' | 'admin_nl';

export interface User {
    id: string;
    username: string;
    email: string;
    name: string;
    phone?: string;
    role: UserRole;
    avatar?: string;
    labScope?: 'computer' | 'biology' | 'physics' | 'chemistry' | 'all' | 'non-lab';
}

export interface ItemLog {
    id: string;
    date: string; // ISO string
    action: string;
    details: string;
}

export type ContainerType = 'table' | 'cupboard' | 'shelf';

export interface Item {
    id: string;
    name: string;
    type: string;
    status: ComponentStatus;
    specs: string;
    imageUrl?: string;
    image_layer?: string; // Backward compatibility
    logs: ItemLog[];
    sku?: string;
    category?: string;
    source?: string;
    isConsumable?: boolean;
    quantity?: number;
    unit?: string;
    minStock?: number;
    parameters?: { label: string; value: string }[];
    condition: ComponentCondition;
}

export type RequestStatus = 'pending' | 'accepted' | 'denied' | 'completed';

export interface ServiceRequest {
    id: string;
    componentId: string;
    componentName: string;
    stationId: string;
    stationName: string;
    roomId: string;
    roomName?: string;
    description: string;
    requesterName?: string;
    componentSku?: string;
    componentCategory?: string;
    status: RequestStatus;
    requestDate: string;
    resolutionDate?: string;
    rejectionReason?: string;
    resolutionOutcome?: 'repaired' | 'broken';
}

export interface Container {
    id: string;
    name: string;
    type: ContainerType;
    status: 'good' | 'warning' | 'error';
    imageUrl?: string;
    items: Item[];
    position: { x: number; y: number };
}

export interface Room {
    id: string;
    name: string;
    category: 'lab' | 'classroom' | 'office' | 'storage' | 'other' | string;
    type: 'computer' | 'physics' | 'biology' | 'non-lab' | string;
    roomOwner?: string;
    customType?: string | null;
    capacity: number;
    containers: Container[];
}
