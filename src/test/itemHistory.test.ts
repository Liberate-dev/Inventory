import { describe, expect, it } from 'vitest';
import type { ItemLog } from '../types';
import {
  buildDeletionHistoryRows,
  getProcurementDateFromLogs,
} from '../utils/itemHistory';

type ReportItem = {
  id: string;
  sku?: string;
  name: string;
  condition: 'good' | 'service' | 'damaged' | 'broken';
  room_id?: string;
  room_name?: string;
  deleted_at?: string | null;
  logs?: ItemLog[];
};

describe('getProcurementDateFromLogs', () => {
  it('uses the earliest procurement-style log date', () => {
    const logs: ItemLog[] = [
      {
        id: '2',
        action: 'TRANSFER',
        date: '2026-03-07T10:00:00.000Z',
        details: '{}',
      },
      {
        id: '1',
        action: 'CREATED',
        date: '2026-01-05T08:00:00.000Z',
        details: '{}',
      },
      {
        id: '3',
        action: 'PURCHASE',
        date: '2026-02-01T08:00:00.000Z',
        details: '{}',
      },
    ];

    expect(getProcurementDateFromLogs(logs)).toBe('2026-01-05T08:00:00.000Z');
  });
});

describe('buildDeletionHistoryRows', () => {
  it('builds deletion history rows from delete logs in the selected month', () => {
    const items: ReportItem[] = [
      {
        id: '101',
        sku: 'INV-13-0168',
        name: 'Buku Fiksi',
        condition: 'broken',
        room_id: '1',
        room_name: 'Perpustakaan',
        deleted_at: '2026-03-08 11:30:00',
        logs: [
          {
            id: '1',
            action: 'CREATED',
            date: '2026-01-10T08:00:00.000Z',
            details: '{}',
          },
          {
            id: '2',
            action: 'DELETE',
            date: '2026-03-08T11:30:00.000Z',
            details: JSON.stringify({
              deletedBy: 'Sarpras',
              conditionAtDeletion: 'broken',
            }),
          },
          {
            id: '3',
            action: 'RESTORE',
            date: '2026-03-09T11:30:00.000Z',
            details: '{}',
          },
        ],
      },
      {
        id: '102',
        sku: 'INV-04-0048',
        name: 'Kaca Preparat',
        condition: 'good',
        room_id: '2',
        room_name: 'Lab Biologi',
        deleted_at: null,
        logs: [
          {
            id: '4',
            action: 'CREATED',
            date: '2026-02-10T08:00:00.000Z',
            details: '{}',
          },
          {
            id: '5',
            action: 'DELETE',
            date: '2026-02-11T11:30:00.000Z',
            details: '{}',
          },
        ],
      },
    ];

    expect(
      buildDeletionHistoryRows(items, {
        selectedMonth: '2026-03',
        visibleRoomIds: ['1'],
      }),
    ).toEqual([
      {
        id: '101-2',
        sku: 'INV-13-0168',
        procurementDate: '2026-01-10T08:00:00.000Z',
        deletionDate: '2026-03-08T11:30:00.000Z',
        conditionText: 'Rusak',
      },
    ]);
  });
});
