import { describe, expect, test } from 'vitest';
import { openDb } from '../../src/core/db';
import { seedDefaultPresets } from '../../src/core/defaults';
import { listPresets, savePreset } from '../../src/core/presets';

describe('default presets', () => {
  test('seeds three presets once', () => {
    const db = openDb(':memory:');
    expect(seedDefaultPresets(db)).toBe(true);
    expect(listPresets(db).map((p) => p.name)).toEqual(['Разминка', 'Жесты 20', 'Длинная']);
    expect(seedDefaultPresets(db)).toBe(false);
    expect(listPresets(db)).toHaveLength(3);
  });

  test('does not seed when a user preset exists', () => {
    const db = openDb(':memory:');
    savePreset(db, { name: 'Мой', description: '', groups: [{ repeats: 1, workLabel: 'a', workSec: 10, restSec: 0 }] });
    expect(seedDefaultPresets(db)).toBe(false);
    expect(listPresets(db)).toHaveLength(1);
  });

  test('preset contents', () => {
    const db = openDb(':memory:');
    seedDefaultPresets(db);
    const [warm, gest, long] = listPresets(db);
    expect(warm.description).toBe('подготовка, 35 быстрых набросков по минуте, формы и конструкция');
    expect(warm.groups).toEqual([
      { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 },
      { repeats: 35, workLabel: 'Быстрые наброски', workSec: 60, restSec: 15 },
      { repeats: 2, workLabel: 'Формы', workSec: 180, restSec: 15 },
      { repeats: 1, workLabel: 'Конструкция', workSec: 300, restSec: 15 },
    ]);
    expect(gest.description).toBe('короткие жесты на разогрев');
    expect(gest.groups).toEqual([{ repeats: 30, workLabel: 'Жест', workSec: 30, restSec: 10 }]);
    expect(long.description).toBe('мало рисунков, много времени на каждый');
    expect(long.groups).toEqual([
      { repeats: 10, workLabel: 'Позы', workSec: 120, restSec: 20 },
      { repeats: 3, workLabel: 'Проработка', workSec: 900, restSec: 60 },
    ]);
  });
});
