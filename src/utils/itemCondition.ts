export const normalizeItemCondition = (condition?: string): 'good' | 'service' | 'damaged' => {
  if (condition === 'good') return 'good';
  if (condition === 'service') return 'service';
  return 'damaged';
};

export const getItemConditionLabel = (condition?: string): string => {
  const normalized = normalizeItemCondition(condition);
  if (normalized === 'good') return 'Baik';
  if (normalized === 'service') return 'Service';
  return 'Rusak';
};

export const getItemConditionOptions = () => [
  { value: 'good', label: 'Baik' },
  { value: 'service', label: 'Service' },
  { value: 'damaged', label: 'Rusak' },
] as const;

export const getItemConditionBadgeClasses = (condition?: string, tone: 'light' | 'dark' = 'light'): string => {
  const normalized = normalizeItemCondition(condition);

  if (tone === 'dark') {
    if (normalized === 'good') return 'bg-emerald-500/20 text-emerald-400';
    if (normalized === 'service') return 'bg-amber-500/20 text-amber-400';
    return 'bg-rose-500/20 text-rose-400';
  }

  if (normalized === 'good') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'service') return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
};
