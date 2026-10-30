import { describe, expect, test } from 'vitest';
import { openDb } from '../../src/core/db';
import { getSetting, parseIds, readSettings, setSetting } from '../../src/core/settings';

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

  test('readSettings: fresh database is a first run with nothing selected', () => {
    const db = openDb(':memory:');
    expect(readSettings(db)).toEqual({ selectedPreset: null, selectedCategories: [], firstRunDone: false });
  });

  test('readSettings: saved selection and the first-run flag', () => {
    const db = openDb(':memory:');
    setSetting(db, 'selectedPreset', '4');
    setSetting(db, 'selectedCategories', '[1,2]');
    setSetting(db, 'firstRunDone', '1');
    expect(readSettings(db)).toEqual({ selectedPreset: 4, selectedCategories: [1, 2], firstRunDone: true });
    setSetting(db, 'selectedPreset', '');
    expect(readSettings(db).selectedPreset).toBeNull();
  });

  test('readSettings: upgrade from 0.1 — a saved library means the first run is already done', () => {
    const db = openDb(':memory:');
    setSetting(db, 'library', 'D:\\Рисунки');
    expect(readSettings(db).firstRunDone).toBe(true);
  });
});
