import { describe, it, expect } from 'vitest';
import { sanitizeFilterValue, sanitizeIds, sanitizeIdsOptional, sanitizeGuid } from './filter-sanitize';

describe('sanitizeFilterValue', () => {
  it('returns plain strings unchanged', () => {
    expect(sanitizeFilterValue('John')).toBe('John');
  });

  it('doubles single quotes for SQL escaping', () => {
    expect(sanitizeFilterValue("O'Brien")).toBe("O''Brien");
  });

  it('handles multiple single quotes', () => {
    expect(sanitizeFilterValue("it's a 'test'")).toBe("it''s a ''test''");
  });

  it('handles empty string', () => {
    expect(sanitizeFilterValue('')).toBe('');
  });
});

describe('sanitizeIds', () => {
  it('joins valid positive integers with commas', () => {
    expect(sanitizeIds([1, 2, 3])).toBe('1,2,3');
  });

  it('filters out non-finite numbers', () => {
    expect(sanitizeIds([1, NaN, Infinity, 2])).toBe('1,2');
  });

  it('filters out zero and negative numbers', () => {
    expect(sanitizeIds([0, -1, 5, -99])).toBe('5');
  });

  it('throws when no valid IDs remain', () => {
    expect(() => sanitizeIds([])).toThrow('sanitizeIds: no valid IDs provided');
    expect(() => sanitizeIds([0, -1, NaN])).toThrow('sanitizeIds: no valid IDs provided');
  });

  it('handles single ID', () => {
    expect(sanitizeIds([42])).toBe('42');
  });
});

describe('sanitizeIdsOptional', () => {
  it('joins valid IDs like sanitizeIds', () => {
    expect(sanitizeIdsOptional([1, 2, 3])).toBe('1,2,3');
  });

  it('returns empty string instead of throwing for empty input', () => {
    expect(sanitizeIdsOptional([])).toBe('');
  });

  it('returns empty string when all IDs are invalid', () => {
    expect(sanitizeIdsOptional([0, -1, NaN])).toBe('');
  });

  it('filters out non-positive and non-finite numbers', () => {
    expect(sanitizeIdsOptional([0, 5, -1, 10, NaN])).toBe('5,10');
  });
});

describe('sanitizeGuid', () => {
  it('returns a valid lowercase GUID unchanged', () => {
    const guid = '12345678-1234-1234-1234-123456789abc';
    expect(sanitizeGuid(guid)).toBe(guid);
  });

  it('accepts uppercase GUIDs', () => {
    const guid = '12345678-1234-1234-1234-123456789ABC';
    expect(sanitizeGuid(guid)).toBe(guid);
  });

  it('throws on invalid format', () => {
    expect(() => sanitizeGuid('not-a-guid')).toThrow('Invalid GUID format');
  });

  it('throws on empty string', () => {
    expect(() => sanitizeGuid('')).toThrow('Invalid GUID format');
  });

  it('throws on SQL injection attempt', () => {
    expect(() => sanitizeGuid("'; DROP TABLE Contacts; --")).toThrow('Invalid GUID format');
  });
});
