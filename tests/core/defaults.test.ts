import { describe, expect, test } from 'vitest';
import { openDb } from '../../src/core/db';
import { seedDefaultPresets } from '../../src/core/defaults';
import { expandPreset } from '../../src/core/timer';
import { formatTotal, totalSec } from '../../src/core/dial';
import { listPresets, savePreset } from '../../src/core/presets';

describe('default presets', () => {
  test('seeds the 1 h preset once', () => {
    const db = openDb(':memory:');
    expect(seedDefaultPresets(db)).toBe(true);
    expect(listPresets(db).map((p) => p.name)).toEqual(['1 ч']);
    expect(seedDefaultPresets(db)).toBe(false);
    expect(listPresets(db)).toHaveLength(1);
  });

  test('an existing library gets the 1 h preset once, keeping its own', () => {
    const db = openDb(':memory:');
    savePreset(db, { name: 'Мой', description: '', groups: [{ repeats: 1, workLabel: 'a', workSec: 10, restSec: 0 }] });
    expect(seedDefaultPresets(db)).toBe(true);
    expect(listPresets(db).map((p) => p.name)).toEqual(['Мой', '1 ч']);
    expect(seedDefaultPresets(db)).toBe(false);
  });

  test('the 1 h preset adds up to one hour', () => {
    const db = openDb(':memory:');
    seedDefaultPresets(db);
    const [hour] = listPresets(db);
    expect(formatTotal(totalSec(expandPreset(hour)))).toBe('1 ч');
    expect(hour.description).toBe('наброски по минуте, отдых 15 секунд');
    expect(hour.groups).toEqual([
      { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0, categoryIds: [] },
      { repeats: 48, workLabel: 'Наброски', workSec: 60, restSec: 15, categoryIds: [] },
    ]);
  });
});
