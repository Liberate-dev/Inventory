import { describe, expect, it } from 'vitest';
import type { Room } from '../types';
import { calculateRoomHealthPercentage } from '../utils/roomHealth';

const createRoom = (items: Array<Partial<Room['containers'][number]['items'][number]>>): Room => ({
  id: 'room-1',
  name: 'Lab Komputer 1',
  category: 'lab',
  type: 'computer',
  capacity: 30,
  containers: [
    {
      id: 'container-1',
      name: 'Rak A',
      type: 'shelf',
      status: 'good',
      position: { x: 0, y: 0 },
      items: items.map((item, index) => ({
        id: `item-${index + 1}`,
        name: `Item ${index + 1}`,
        type: 'General',
        condition: 'good',
        status: 'available',
        specs: '',
        logs: [],
        ...item,
      })),
    },
  ],
});

describe('calculateRoomHealthPercentage', () => {
  it('uses item condition instead of availability status', () => {
    const room = createRoom([
      { condition: 'good', status: 'maintenance' },
      { condition: 'service', status: 'available' },
      { condition: 'good', status: 'missing' },
    ]);

    expect(calculateRoomHealthPercentage(room)).toBe(67);
  });

  it('returns 100 when a room has no items', () => {
    expect(calculateRoomHealthPercentage(createRoom([]))).toBe(100);
  });
});
