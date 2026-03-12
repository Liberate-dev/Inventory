import { getItemConditionBadgeClasses, getItemConditionLabel } from '../../utils/itemCondition';

type ItemConditionBadgeProps = {
  condition?: string;
  tone?: 'light' | 'dark';
  className?: string;
};

export function ItemConditionBadge({
  condition,
  tone = 'light',
  className = '',
}: ItemConditionBadgeProps) {
  return (
    <span
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-full font-bold ${getItemConditionBadgeClasses(condition, tone)} ${className}`.trim()}
    >
      {getItemConditionLabel(condition)}
    </span>
  );
}
