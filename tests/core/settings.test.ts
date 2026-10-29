import { describe, expect, test } from 'vitest';
import { openDb } from '../../src/core/db';
import { getSetting, parseIds, setSetting } from '../../src/core/settings';

describe('settings', () => {
  test('setSetting then getSetting returns the value; overwrite replaces it; unknown key → null', () => {
    const db = openDb(':memory:');
    expect(getSetting(db, 'k')).toBeNull();
    setSetting(db, 'k', 'a');
    expect(getSetting(db, 'k')).toBe('a');
    setSetting(db, 'k', 'b');
    expect(getSetting(db, 'k')).toBe('b');
    expect(getSetting(db, 'other')).toBeNull();
  });

  test('parses stale category ids', () => {
    expect(parseIds('[1,"x",2.5,3]')).toEqual([1, 3]);
    expect(parseIds('oops')).toEqual([]);
    expect(parseIds(null)).toEqual([]);
    expect(parseIds('{"a":1}')).toEqual([]);
  });
});
