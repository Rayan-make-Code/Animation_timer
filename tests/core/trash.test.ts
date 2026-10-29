import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { openDb, type Db } from '../../src/core/db';
import { syncLibrary } from '../../src/core/library';
import { buildQueue, cycleStatus } from '../../src/core/picker';
import { trashImage, type TrashFn } from '../../src/core/trash';
import { makeFiles, tmpDir } from '../helpers';

let db: Db;
let root: string;
beforeEach(async () => {
  db = openDb(':memory:');
  root = tmpDir();
  makeFiles(root, { 'A/1.png': 'x', 'A/2.png': 'y' });
  await syncLibrary(db, root);
});

const idOf = (rel: string) => (db.prepare('select id from images where rel_path = ?').get(rel) as { id: number }).id;
const missingOf = (id: number) => (db.prepare('select missing from images where id = ?').get(id) as { missing: number }).missing;
const catIds = () => (db.prepare('select id from categories').all() as { id: number }[]).map((r) => r.id);

describe('trashImage', () => {
  test('moves the file and marks the image missing', async () => {
    const bin = tmpDir();
    const trash: TrashFn = async (abs) => { fs.renameSync(abs, path.join(bin, path.basename(abs))); };
    const id = idOf('A/1.png');
    const before = cycleStatus(db, catIds()).total;
    await trashImage(db, root, id, trash);
    expect(fs.existsSync(path.join(root, 'A', '1.png'))).toBe(false);
    expect(fs.existsSync(path.join(bin, '1.png'))).toBe(true);
    expect(missingOf(id)).toBe(1);
    expect(buildQueue(db, catIds(), 5).some((q) => q.image.id === id)).toBe(false);
    expect(cycleStatus(db, catIds()).total).toBe(before - 1);
  });

  test('keeps the record when trash fails', async () => {
    const id = idOf('A/1.png');
    await expect(trashImage(db, root, id, async () => { throw new Error('boom'); })).rejects.toThrow('Не удалось переместить в корзину');
    expect(missingOf(id)).toBe(0);
    expect(fs.existsSync(path.join(root, 'A', '1.png'))).toBe(true);
  });

  test('refuses paths outside the library', async () => {
    const id = idOf('A/1.png');
    db.prepare("update images set rel_path = '../x.png' where id = ?").run(id);
    const trash = vi.fn(async () => {});
    await expect(trashImage(db, root, id, trash)).rejects.toThrow();
    expect(trash).not.toHaveBeenCalled();
    expect(missingOf(id)).toBe(0);
  });

  test('unknown image id rejects', async () => {
    const trash = vi.fn(async () => {});
    await expect(trashImage(db, root, 9999, trash)).rejects.toThrow();
    expect(trash).not.toHaveBeenCalled();
  });
});
