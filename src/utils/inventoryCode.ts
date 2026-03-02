export type InventoryYearFormat = 'none' | '2' | '4';

export interface InventoryCodeSettings {
    prefix: string;
    separator: string;
    yearFormat: InventoryYearFormat;
    includeRoomCode: boolean;
    sequencePadding: number;
    nextNumber: number;
}

export const DEFAULT_INVENTORY_CODE_SETTINGS: InventoryCodeSettings = {
    prefix: 'INV',
    separator: '-',
    yearFormat: '4',
    includeRoomCode: true,
    sequencePadding: 4,
    nextNumber: 1
};

export const deriveRoomCode = (roomName?: string): string => {
    if (!roomName || roomName.trim().length === 0) return 'ROOM';

    const cleaned = roomName
        .toUpperCase()
        .replace(/[^A-Z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return 'ROOM';

    const tokens = cleaned.split(' ').filter(Boolean);
    if (tokens.length >= 2) {
        const initials = tokens.slice(0, 3).map((token) => token[0]).join('');
        if (initials.length >= 2) return initials;
    }

    return tokens[0].slice(0, 3);
};

export const buildInventoryCode = (
    settings: InventoryCodeSettings,
    sequence: number,
    roomCode?: string,
    now: Date = new Date()
): string => {
    const separator = settings.separator || '-';
    const parts: string[] = [];

    const prefix = settings.prefix.trim().toUpperCase();
    if (prefix) parts.push(prefix);

    if (settings.yearFormat === '4') {
        parts.push(String(now.getFullYear()));
    } else if (settings.yearFormat === '2') {
        parts.push(String(now.getFullYear()).slice(-2));
    }

    if (settings.includeRoomCode) {
        const normalizedRoomCode = (roomCode || '').trim().toUpperCase();
        if (normalizedRoomCode) {
            parts.push(normalizedRoomCode);
        }
    }

    const safePadding = Math.max(2, Math.min(8, settings.sequencePadding || 4));
    const safeSequence = Math.max(1, Math.floor(sequence || 1));
    parts.push(String(safeSequence).padStart(safePadding, '0'));

    return parts.join(separator);
};
