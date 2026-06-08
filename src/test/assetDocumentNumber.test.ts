import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_NUMBER_SETTINGS,
  getDefaultDepreciationStartDate,
  buildDocumentNumber
} from '../utils/assetDocumentNumber';

describe('getDefaultDepreciationStartDate', () => {
  it('uses the acquisition date as the default depreciation start date', () => {
    expect(getDefaultDepreciationStartDate('2026-05-15')).toBe('2026-05-15');
    expect(getDefaultDepreciationStartDate('2026-01-31')).toBe('2026-01-31');
  });

  it('returns an empty string for invalid date input', () => {
    expect(getDefaultDepreciationStartDate('')).toBe('');
    expect(getDefaultDepreciationStartDate('2026-02-31')).toBe('');
  });
});

describe('buildDocumentNumber', () => {
  it('builds the default document number from the acquisition year', () => {
    expect(buildDocumentNumber(DEFAULT_DOCUMENT_NUMBER_SETTINGS, 7, '2026-05-15')).toBe('DOC-2026-0007');
  });
});
