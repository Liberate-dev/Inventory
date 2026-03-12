import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ItemConditionBadge } from '../components/common/ItemConditionBadge';
import { getItemConditionLabel, getItemConditionOptions } from '../utils/itemCondition';

describe('item condition helpers', () => {
  it('collapses damaged and broken into a single rusak label', () => {
    expect(getItemConditionLabel('damaged')).toBe('Rusak');
    expect(getItemConditionLabel('broken')).toBe('Rusak');
  });

  it('exposes only tiga opsi kondisi item untuk input user', () => {
    expect(getItemConditionOptions()).toEqual([
      { value: 'good', label: 'Baik' },
      { value: 'service', label: 'Service' },
      { value: 'damaged', label: 'Rusak' },
    ]);
  });
});

describe('ItemConditionBadge', () => {
  it('renders consistent color badges for all kondisi item', () => {
    const { rerender } = render(<ItemConditionBadge condition="good" />);
    expect(screen.getByText('Baik')).toHaveClass('bg-emerald-100', 'text-emerald-700');

    rerender(<ItemConditionBadge condition="service" />);
    expect(screen.getByText('Service')).toHaveClass('bg-amber-100', 'text-amber-700');

    rerender(<ItemConditionBadge condition="broken" />);
    expect(screen.getByText('Rusak')).toHaveClass('bg-rose-100', 'text-rose-700');
  });
});
