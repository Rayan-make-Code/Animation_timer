import { beforeEach, describe, expect, test } from 'vitest';
import { openDb, type Db } from '../../src/core/db';
import { copyPreset, deletePreset, listPresets, savePreset, validatePreset, type NewPreset } from '../../src/core/presets';

const sample: NewPreset = {
  name: 'Разминка',
  description: 'Пример из описания продукта',
  groups: [
    { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 },
    { repeats: 35, workLabel: 'Быстрые наброски', workSec: 60, restSec: 15 },
    { repeats: 2, workLabel: 'Формы', workSec: 180, restSec: 15 },
    { repeats: 1, workLabel: 'Конструкция', workSec: 300, restSec: 15 },
  ],
};

let db: Db;
beforeEach(() => { db = openDb(':memory:'); });

describe('presets', () => {
  test('round-trips the example preset keeping group order', () => {
    const id = savePreset(db, sample);
    expect(listPresets(db)).toEqual([{ id, ...sample }]);
  });

  test('saving with an id replaces the groups', () => {
    const id = savePreset(db, sample);
    savePreset(db, { ...sample, id, groups: [sample.groups[1]] });
    expect(listPresets(db)[0].groups).toEqual([sample.groups[1]]);
  });

  test('copy creates an independent preset', () => {
    const id = savePreset(db, sample);
    const copy = copyPreset(db, id);
    deletePreset(db, id);
    const rest = listPresets(db);
    expect(rest.map((p) => p.id)).toEqual([copy]);
    expect(rest[0].name).toBe('Разминка (копия)');
    expect(rest[0].groups).toEqual(sample.groups);
  });

  test('delete removes the groups', () => {
    const id = savePreset(db, sample);
    deletePreset(db, id);
    expect(db.prepare('select count(*) as c from preset_groups').get()).toEqual({ c: 0 });
  });
});

describe('validatePreset', () => {
  test('accepts the example', () => expect(validatePreset(sample)).toEqual([]));
  test.each([
    ['empty name', { ...sample, name: '  ' }],
    ['no groups', { ...sample, groups: [] }],
    ['repeats 0', { ...sample, groups: [{ ...sample.groups[0], repeats: 0 }] }],
    ['work 0', { ...sample, groups: [{ ...sample.groups[0], workSec: 0 }] }],
    ['negative rest', { ...sample, groups: [{ ...sample.groups[0], restSec: -1 }] }],
    ['fractional repeats', { ...sample, groups: [{ ...sample.groups[0], repeats: 1.5 }] }],
  ])('rejects %s', (_n, p) => expect(validatePreset(p).length).toBeGreaterThan(0));

  test('savePreset refuses an invalid preset', () => {
    expect(() => savePreset(db, { ...sample, groups: [] })).toThrow();
  });
});
