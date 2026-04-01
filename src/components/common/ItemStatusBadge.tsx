import type { ComponentStatus } from '../../types';
import { getItemStatusBadgeClasses, getItemStatusLabel } from '../../utils/itemCondition';

type ItemStatusBadgeProps = {
  status?: ComponentStatus;
  tone?: 'light' | 'dark';
  className?: string;
};

export function ItemStatusBadge({
  status = 'good',
  tone = 'light',
  className = '',
}: ItemStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-full font-bold px-2.5 py-0.5 text-[10px] border ${getItemStatusBadgeClasses(status, tone)} ${className}`.trim()}
    >
      {getItemStatusLabel(status)}
    </span>
  );
}
