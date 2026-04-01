import type { ComponentStatus, ComponentCondition } from '../types';

export const getItemStatusLabel = (status: ComponentStatus): string => {
  switch (status) {
    case 'good': return 'Baik';
    case 'in_use': return 'Dipinjam';
    case 'maintenance': return 'Service';
    case 'broken': return 'Rusak';
    default: return 'Unknown';
  }
};

export const getItemConditionLabel = (condition: ComponentCondition | string): string => {
  switch (condition) {
    case 'good': return 'Baik';
    case 'service': return 'Perlu Perbaikan';
    case 'damaged': return 'Rusak Ringan';
    case 'broken': return 'Rusak Berat';
    default: return condition;
  }
};

export const getItemStatusOptions = () => [
  { value: 'good', label: 'Baik' },
  { value: 'in_use', label: 'Dipinjam' },
  { value: 'maintenance', label: 'Service' },
  { value: 'broken', label: 'Rusak' },
] as const;

export const getItemStatusBadgeClasses = (status: ComponentStatus, tone: 'light' | 'dark' = 'light'): string => {
  if (tone === 'dark') {
    switch (status) {
      case 'good': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'in_use': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
      case 'maintenance': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'broken': return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  }

  switch (status) {
    case 'good': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'in_use': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
    case 'maintenance': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'broken': return 'bg-rose-100 text-rose-700 border-rose-200';
    default: return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};
