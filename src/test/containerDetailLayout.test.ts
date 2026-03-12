import { describe, expect, it } from 'vitest';
import source from '../components/inventory/ContainerDetailModal.tsx?raw';

describe('ContainerDetailModal layout guards', () => {
  it('uses a scrollable form body with a footer anchored to the modal bottom', () => {
    expect(source).toContain('max-h-[90vh] flex flex-col overflow-hidden');
    expect(source).toContain('flex-1 space-y-6 overflow-y-auto');
    expect(source).toContain('shrink-0 border-t border-gray-100');
  });

  it('supports closing via backdrop and deep-linked item detail actions', () => {
    expect(source).toContain('const handleCloseForm = () => {');
    expect(source).toContain('if (initialItemId) {');
    expect(source).toContain('onClick={onClose}');
    expect(source).toContain('onClick={handleCloseForm}');
    expect(source).toContain('onClick={(e) => e.stopPropagation()}');
  });
});
