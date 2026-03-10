import { describe, it, expect } from 'vitest';
import { safeParseJson } from './safeParseJson';

describe('safeParseJson', () => {
  it('returns fallback for null', () => {
    expect(safeParseJson(null, 42)).toBe(42);
    expect(safeParseJson(null, { x: 1 })).toEqual({ x: 1 });
  });

  it('returns fallback for undefined', () => {
    expect(safeParseJson(undefined, 'default')).toBe('default');
  });

  it('returns fallback for empty string', () => {
    expect(safeParseJson('', [])).toEqual([]);
  });

  it('parses valid JSON', () => {
    expect(safeParseJson('{"a":1}', {})).toEqual({ a: 1 });
    expect(safeParseJson('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(safeParseJson('true', false)).toBe(true);
    expect(safeParseJson('"hello"', '')).toBe('hello');
  });

  it('returns fallback for invalid JSON', () => {
    const fallback = { default: true };
    expect(safeParseJson('not json', fallback)).toBe(fallback);
    expect(safeParseJson('{ broken', fallback)).toBe(fallback);
    expect(safeParseJson('undefined', fallback)).toBe(fallback);
  });
});
