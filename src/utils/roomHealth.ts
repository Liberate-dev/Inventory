import type { Room } from '../types';

export const calculateRoomHealthPercentage = (room: Room): number => {
  let total = 0;
  let good = 0;

  room.containers?.forEach((container) => {
    container.items?.forEach((item) => {
      total += 1;
      if (item.condition === 'good') {
        good += 1;
      }
    });
  });

  return total > 0 ? Math.round((good / total) * 100) : 100;
};
