import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { openDb, type Db } from '../../src/core/db';
import { dislikeImage, isDislikedName } from '../../src/core/dislike';
import { syncLibrary } from '../../src/core/library';
import { buildQueue, cycleStatus } from '../../src/core/picker';
import { renameNewImages } from '../../src/core/rename';
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
const rowOf = (id: number) => db.prepare('select rel_path as relPath, file_name as fileName, rating from images where id = ?').get(id) as { relPath: string; fileName: string; rating: number };
const catIds = () => (db.prepare('select id from categories').all() as { id: number }[]).map((r) => r.id);

describe('dislikeImage', () => {
  test('adds _del to the file name, keeps the file and drops it from sessions', async () => {
    const id = idOf('A/1.png');
    const before = cycleStatus(db, catIds()).total;
    await dislikeImage(db, root, id);
    expect(fs.readdirSync(path.join(root, 'A')).sort()).toEqual(['1_del.png', '2.png']);
    expect(rowOf(id)).toEqual({ relPath: 'A/1_del.png', fileName: '1_del.png', rating: -1 });
    expect(buildQueue(db, catIds(), 5).some((q) => q.image.id === id)).toBe(false);
    expect(cycleStatus(db, catIds()).total).toBe(before - 1);
  });

  test('picks a free name when _del is already taken', async () => {
    fs.writeFileSync(path.join(root, 'A', '1_del.png'), 'z');
    await dislikeImage(db, root, idOf('A/1.png'));
    expect(fs.existsSync(path.join(root, 'A', '1_del2.png'))).toBe(true);
  });

  test('keeps the record when the rename fails', async () => {
    const id = idOf('A/1.png');
    await expect(dislikeImage(db, root, id, async () => { throw new Error('boom'); })).rejects.toThrow('Не удалось пометить файл');
    expect(rowOf(id)).toEqual({ relPath: 'A/1.png', fileName: '1.png', rating: 0 });
    expect(fs.existsSync(path.join(root, 'A', '1.png'))).toBe(true);
  });

  test('refuses paths outside the library', async () => {
    const id = idOf('A/1.png');
    db.prepare("update images set rel_path = '../x.png' where id = ?").run(id);
    await expect(dislikeImage(db, root, id)).rejects.toThrow('Путь вне папки библиотеки');
    expect(rowOf(id).rating).toBe(0);
  });

  test('the folder renamer leaves _del files alone', async () => {
    await dislikeImage(db, root, idOf('A/1.png'));
    await renameNewImages(db, root);
    expect(fs.readdirSync(path.join(root, 'A')).sort()).toEqual(['1_del.png', 'A_img_01.png']);
  });

  test('a _del file found on sync counts as disliked', async () => {
    makeFiles(root, { 'A/old_del.jpg': 'q' });
    await syncLibrary(db, root);
    expect(rowOf(idOf('A/old_del.jpg')).rating).toBe(-1);
  });

  test('recognises marked names', () => {
    expect(isDislikedName('A_img_01_del.png')).toBe(true);
    expect(isDislikedName('A_img_01_del3.png')).toBe(true);
    expect(isDislikedName('model_delta.png')).toBe(false);
    expect(isDislikedName('A_img_01.png')).toBe(false);
  });
});
