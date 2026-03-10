import { describe, it, expect } from 'vitest';
import { parseSheetId } from './contactLogSheets';

describe('parseSheetId', () => {
  it('extracts id from full URL', () => {
    const url = 'https://docs.google.com/spreadsheets/d/abc123XYZ456/edit#gid=0';
    expect(parseSheetId(url)).toBe('abc123XYZ456');
  });

  it('returns raw id when input looks like id (long alphanumeric)', () => {
    expect(parseSheetId('abc123XYZ789def456ghi012jkl345mno')).toBe('abc123XYZ789def456ghi012jkl345mno');
  });

  it('returns null for empty or whitespace', () => {
    expect(parseSheetId('')).toBeNull();
    expect(parseSheetId('   ')).toBeNull();
  });

  it('returns null for invalid input', () => {
    expect(parseSheetId('https://example.com')).toBeNull();
    expect(parseSheetId('short')).toBeNull();
  });
});
