import { useState } from 'react';
import type { Item, ComponentCondition } from '../types';

interface ItemFormData {
    name: string;
    sku: string;
    category: string;
    isConsumable: boolean;
    quantity: number;
    unit: string;
    minStock: number;
    parameters: { label: string; value: string }[];
    condition: ComponentCondition;
}

export const useItemForm = () => {
    const defaultState: ItemFormData = {
        name: '',
        sku: '',
        category: '',
        isConsumable: false,
        quantity: 1,
        unit: 'Pcs',
        minStock: 0,
        parameters: [],
        condition: 'good'
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
            parameters: item.parameters || [],
            condition: item.condition || 'good'
        });
        setIsEditing(true);
        setEditingId(item.id);
    };

    const updateField = <K extends keyof ItemFormData>(field: K, value: ItemFormData[K]) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const generateSku = () => {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        updateField('sku', `INV-${date}-${random}`);
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
