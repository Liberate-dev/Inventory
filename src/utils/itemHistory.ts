import type { ComponentCondition, ItemLog } from '../types';
import { getItemConditionLabel } from './itemCondition';

type HistoryLikeItem = {
  id: string;
  sku?: string;
  condition: ComponentCondition;
  room_id?: string;
  created_at?: string;
  logs?: ItemLog[];
};

type BuildDeletionHistoryOptions = {
  selectedMonth?: string;
  visibleRoomIds?: string[];
};

export type DeletionHistoryRow = {
  id: string;
  sku: string;
  procurementDate: string;
  deletionDate: string;
  conditionText: string;
};

const PROCUREMENT_ACTIONS = ['CREATED', 'STOCK_IN', 'PURCHASE', 'DONATION', 'HIBAH', 'ADDED', 'ADD', 'NEW', 'CREATE'];

const toTime = (value: string): number | null => {
  const date = new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const parseDetails = (raw: unknown): Record<string, unknown> => {
  if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>;
  if (typeof raw !== 'string') return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
};

export const getConditionLabel = (condition: string): string => getItemConditionLabel(condition);

export const getProcurementDateFromLogs = (logs?: { action: string; date: string }[], fallbackDate?: string): string => {
  if (!Array.isArray(logs) || logs.length === 0) return fallbackDate || '-';

  const candidates = logs.filter((log) =>
    PROCUREMENT_ACTIONS.some((keyword) => String(log.action || '').toUpperCase().includes(keyword)),
  );

  const source = candidates.length > 0 ? candidates : logs;

  let earliest = Number.POSITIVE_INFINITY;
  let earliestValue = '';

  source.forEach((log) => {
    const time = toTime(log.date);
    if (time !== null && time < earliest) {
      earliest = time;
      earliestValue = log.date;
    }
  });

  return earliestValue || fallbackDate || '-';
};

export const buildDeletionHistoryRows = (
  items: HistoryLikeItem[],
  options: BuildDeletionHistoryOptions = {},
): DeletionHistoryRow[] => {
  const visibleRoomIds = options.visibleRoomIds ? new Set(options.visibleRoomIds) : null;

  return items
    .filter((item) => {
      if (!visibleRoomIds) return true;
      return item.room_id ? visibleRoomIds.has(String(item.room_id)) : false;
    })
    .flatMap((item) => {
      const procurementDate = getProcurementDateFromLogs(item.logs, item.created_at);

      return (item.logs ?? [])
        .filter((log) => String(log.action || '').toUpperCase().includes('DELETE'))
        .filter((log) => !options.selectedMonth || String(log.date || '').startsWith(options.selectedMonth))
        .map((log) => {
          const details = parseDetails(log.details);
          const conditionAtDeletion = String(
            details.conditionAtDeletion ?? details.condition ?? item.condition ?? '-',
          );

          return {
            id: `${item.id}-${log.id}`,
            sku: item.sku?.trim() || `INV-${item.id}`,
            procurementDate,
            deletionDate: log.date,
            conditionText: getConditionLabel(conditionAtDeletion),
          };
        });
    })
    .sort((a, b) => new Date(b.deletionDate).getTime() - new Date(a.deletionDate).getTime());
};
