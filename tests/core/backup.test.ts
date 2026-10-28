import { describe, expect, test } from 'vitest';
import { BackupError, exportBackup, importBackup } from '../../src/core/backup';
import { openDb, type Db } from '../../src/core/db';
import { listPresets, savePreset } from '../../src/core/presets';
import { recordView, setRating } from '../../src/core/ratings';

function library(files: [string, number][]): Db {
  const db = openDb(':memory:');
  db.prepare("insert into categories(id, name, rel_path) values (1, 'A', 'A')").run();
  files.forEach(([rel, size], i) => {
    db.prepare('insert into images(id, category_id, rel_path, file_name, size) values (?, 1, ?, ?, ?)').run(i + 1, rel, rel.split('/').pop()!, size);
  });
  return db;
}
const rating = (db: Db, rel: string) => (db.prepare('select rating from images where rel_path = ?').get(rel) as { rating: number }).rating;
const group = { repeats: 2, workLabel: 'W', workSec: 30, restSec: 5 };

describe('backup', () => {
  test('exports ratings and presets, imports them into a fresh library with the same paths', () => {
    const src = library([['A/1.jpg', 10], ['A/2.jpg', 20], ['A/3.jpg', 30]]);
    setRating(src, 1, 1);
    setRating(src, 2, -1);
    savePreset(src, { name: 'P', description: 'd', groups: [group] });
    const data = JSON.parse(JSON.stringify(exportBackup(src, { includeViews: false })));

    const dst = library([['A/1.jpg', 10], ['A/2.jpg', 20], ['A/3.jpg', 30]]);
    const report = importBackup(dst, data);
    expect(report).toEqual({ ratingsApplied: 2, ratingsUnmatched: [], presetsAdded: 1 });
    expect([1, 2, 3].map((i) => rating(dst, `A/${i}.jpg`))).toEqual([1, -1, 0]);
    expect(listPresets(dst)[0]).toMatchObject({ name: 'P', groups: [group] });
  });

  test('falls back to size + file name when the folder was moved', () => {
    const src = library([['A/1.jpg', 10]]);
    setRating(src, 1, 1);
    const data = JSON.parse(JSON.stringify(exportBackup(src, { includeViews: false })));
    const dst = library([['Moved/1.jpg', 10]]);
    expect(importBackup(dst, data).ratingsApplied).toBe(1);
    expect(rating(dst, 'Moved/1.jpg')).toBe(1);
  });

  test('reports unmatched images instead of failing', () => {
    const src = library([['A/1.jpg', 10]]);
    setRating(src, 1, -1);
    const data = JSON.parse(JSON.stringify(exportBackup(src, { includeViews: false })));
    const dst = library([['A/other.jpg', 99]]);
    expect(importBackup(dst, data)).toMatchObject({ ratingsApplied: 0, ratingsUnmatched: ['A/1.jpg'] });
  });

  test('a preset with the same name is imported as a copy, existing one is untouched', () => {
    const db = library([]);
    savePreset(db, { name: 'P', description: 'old', groups: [group] });
    const data = JSON.parse(JSON.stringify(exportBackup(db, { includeViews: false })));
    importBackup(db, data);
    expect(listPresets(db).map((p) => [p.name, p.description])).toEqual([['P', 'old'], ['P (импорт)', 'old']]);
  });

  test('views are exported only when requested', () => {
    const db = library([['A/1.jpg', 10]]);
    recordView(db, 1, 1);
    expect(exportBackup(db, { includeViews: false }).views).toBeUndefined();
    expect(exportBackup(db, { includeViews: true }).views).toHaveLength(1);
  });

  test.each([
    ['garbage', 'not json object'],
    ['wrong format', { format: 'other', version: 1 }],
    ['newer version', { format: 'sketch-timer-backup', version: 2, ratings: [], presets: [] }],
    ['broken ratings', { format: 'sketch-timer-backup', version: 1, ratings: 5, presets: [] }],
  ])('rejects %s without touching the database', (_n, data) => {
    const db = library([['A/1.jpg', 10]]);
    expect(() => importBackup(db, data)).toThrow(BackupError);
    expect(listPresets(db)).toEqual([]);
  });

  test('an invalid preset in the file rolls back the whole import', () => {
    const db = library([['A/1.jpg', 10]]);
    const data = { format: 'sketch-timer-backup', version: 1, ratings: [{ relPath: 'A/1.jpg', fileName: '1.jpg', size: 10, rating: 1 }], presets: [{ name: '', description: '', groups: [] }] };
    expect(() => importBackup(db, data)).toThrow(BackupError);
    expect(rating(db, 'A/1.jpg')).toBe(0);
  });
});
