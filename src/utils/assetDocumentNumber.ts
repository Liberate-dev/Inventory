export type DocumentYearFormat = 'none' | '2' | '4';

export interface DocumentNumberSettings {
  prefix: string;
  separator: string;
  yearFormat: DocumentYearFormat;
  sequencePadding: number;
  nextNumber: number;
}

export const DEFAULT_DOCUMENT_NUMBER_SETTINGS: DocumentNumberSettings = {
  prefix: 'DOC',
  separator: '-',
  yearFormat: '4',
  sequencePadding: 4,
  nextNumber: 1
};

export const getDefaultDepreciationStartDate = (dateValue: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return '';

  const [yearPart, monthPart, dayPart] = dateValue.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const day = Number(dayPart);

  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
    return '';
  }

  const source = new Date(Date.UTC(year, monthIndex, day));
  if (
    source.getUTCFullYear() !== year ||
    source.getUTCMonth() !== monthIndex ||
    source.getUTCDate() !== day
  ) {
    return '';
  }

  return dateValue;
};

export const buildDocumentNumber = (
  settings: DocumentNumberSettings,
  sequence: number,
  dateValue: string,
): string => {
  const separator = settings.separator || '-';
  const parts: string[] = [];
  const prefix = settings.prefix.trim().toUpperCase();

  if (prefix) parts.push(prefix);

  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ? new Date(`${dateValue}T00:00:00Z`)
    : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getUTCFullYear() : date.getUTCFullYear();

  if (settings.yearFormat === '4') {
    parts.push(String(year));
  } else if (settings.yearFormat === '2') {
    parts.push(String(year).slice(-2));
  }

  const safePadding = Math.max(2, Math.min(8, settings.sequencePadding || 4));
  const safeSequence = Math.max(1, Math.floor(sequence || 1));
  parts.push(String(safeSequence).padStart(safePadding, '0'));

  return parts.join(separator);
};
