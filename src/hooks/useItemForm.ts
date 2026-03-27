import { useState } from 'react';
import type { Item, ComponentCondition } from '../types';
import {
    buildInventoryCode,
    DEFAULT_INVENTORY_CODE_SETTINGS,
    deriveRoomCode,
    type InventoryCodeSettings
} from '../utils/inventoryCode';
import { getAuthHeaders } from '../utils/api';

interface ItemFormData {
    name: string;
    sku: string;
    category: string;
    isConsumable: boolean;
    quantity: number | '';
    unit: string;
    minStock: number | '';
    source: string;
    parameters: { label: string; value: string }[];
    condition: ComponentCondition;
    imageUrl: string;
}

export const useItemForm = (initialItem?: Item | null) => {
    void initialItem;
    const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/public/api').replace(/\/+$/, '');
    const INVENTORY_CODES_ENDPOINT = `${API_BASE_URL}/inventory/inventory_codes.php`;

    const defaultState: ItemFormData = {
        name: '',
        sku: '',
        category: '',
        isConsumable: false,
        quantity: '',
        unit: 'Pcs',
        minStock: '',
        source: '',
        parameters: [],
        condition: 'good',
        imageUrl: ''
    };

    const [formData, setFormData] = useState<ItemFormData>(defaultState);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    const resetForm = () => {
        setFormData(defaultState);
        setIsEditing(false);
        setEditingId(null);
    };

    const loadItem = (item: Item) => {
        setFormData({
            name: item.name,
            sku: item.sku || '',
            category: item.category || item.type || '',
            isConsumable: item.isConsumable || false,
            quantity: item.quantity || 1,
            unit: item.unit || 'Pcs',
            minStock: item.minStock || 0,
            source: item.source || '',
            parameters: item.parameters || [],
            condition: item.condition || 'good',
            imageUrl: item.imageUrl || item.image_layer || ''
        });
        setIsEditing(true);
        setEditingId(item.id);
    };

    const updateField = <K extends keyof ItemFormData>(field: K, value: ItemFormData[K]) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const generateSku = async (options?: { roomId?: string; roomName?: string }) => {
        try {
            const response = await fetch(INVENTORY_CODES_ENDPOINT, {
                method: 'POST',
                headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    action: 'generate',
                    roomId: options?.roomId ?? null,
                    roomName: options?.roomName ?? null
                })
            });

            const payload = await response.json().catch(() => ({})) as {
                status?: string;
                code?: string;
                settings?: Partial<InventoryCodeSettings>;
            };
            if (response.ok && payload.status === 'success' && typeof payload.code === 'string' && payload.code.trim().length > 0) {
                updateField('sku', payload.code.trim().toUpperCase());
                return;
            }

            const fallbackSettings: InventoryCodeSettings = {
                ...DEFAULT_INVENTORY_CODE_SETTINGS,
                ...(payload.settings ?? {})
            };
            const fallbackCode = buildInventoryCode(
                fallbackSettings,
                Date.now() % 10000,
                deriveRoomCode(options?.roomName)
            );
            updateField('sku', fallbackCode);
        } catch {
            const fallbackCode = buildInventoryCode(
                DEFAULT_INVENTORY_CODE_SETTINGS,
                Date.now() % 10000,
                deriveRoomCode(options?.roomName)
            );
            updateField('sku', fallbackCode);
        }
    };

    // Parameter Logic Helpers
    const addParameter = (label = '', value = '') => {
        updateField('parameters', [...formData.parameters, { label, value }]);
    };

    const removeParameter = (index: number) => {
        updateField('parameters', formData.parameters.filter((_, i) => i !== index));
    };

    const updateParameter = (index: number, key: 'label' | 'value', value: string) => {
        const newParams = [...formData.parameters];
        newParams[index][key] = value;
        updateField('parameters', newParams);
    };

    return {
        formData,
        isEditing,
        editingId,
        updateField,
        resetForm,
        loadItem,
        generateSku,
        parameterActions: {
            add: addParameter,
            remove: removeParameter,
            update: updateParameter
        }
    };
};
