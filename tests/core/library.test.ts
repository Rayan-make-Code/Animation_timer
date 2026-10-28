import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { openDb, type Db } from '../../src/core/db';
import { listTree, syncLibrary } from '../../src/core/library';
import { makeFiles, tmpDir } from '../helpers';

let db: Db;
let root: string;

beforeEach(() => {
  db = openDb(':memory:');
  root = tmpDir();
  makeFiles(root, {
    'Лица/Мужские/a.jpg': 'a',
    'Позы/b.png': 'b',
    'Позы/c.gif': 'c',
    'Позы/readme.txt': 't',
    'loose.png': 'x',
  });
});

const names = (table: string) => (db.prepare(`select name from ${table} order by name`).all() as { name: string }[]).map((r) => r.name);

describe('syncLibrary', () => {
  test('builds the category tree and indexes supported images only', async () => {
    const res = await syncLibrary(db, root);
    expect(res).toMatchObject({ addedImages: 3, addedCategories: 4, missing: 0, restored: 0 });
    expect(names('categories')).toEqual([path.basename(root), 'Лица', 'Мужские', 'Позы']);
    const tree = listTree(db);
    expect(tree.map((n) => n.name)).toEqual([path.basename(root), 'Лица', 'Позы']);
    expect(tree[1].children.map((n) => n.name)).toEqual(['Мужские']);
    expect(tree.map((n) => n.imageCount)).toEqual([1, 1, 1]);
  });

  test('images lying directly in the library folder go to a category named after it', async () => {
    await syncLibrary(db, root);
    expect(db.prepare("select rel_path, file_name from images where file_name = 'loose.png'").get()).toEqual({ rel_path: 'loose.png', file_name: 'loose.png' });
    expect(await syncLibrary(db, root)).toMatchObject({ addedImages: 0, addedCategories: 0 });
  });

  test('second sync adds nothing, a new file is picked up', async () => {
    await syncLibrary(db, root);
    expect(await syncLibrary(db, root)).toMatchObject({ addedImages: 0, addedCategories: 0 });
    makeFiles(root, { 'Позы/new.webp': 'n', 'Новая/x.jpg': 'x' });
    expect(await syncLibrary(db, root)).toMatchObject({ addedImages: 2, addedCategories: 1 });
  });

  test('deleted file is marked missing and restored with its rating kept', async () => {
    await syncLibrary(db, root);
    db.prepare("update images set rating = 1 where rel_path = ?").run('Позы/b.png');
    fs.rmSync(path.join(root, 'Позы', 'b.png'));
    expect(await syncLibrary(db, root)).toMatchObject({ missing: 1 });
    makeFiles(root, { 'Позы/b.png': 'b' });
    expect(await syncLibrary(db, root)).toMatchObject({ restored: 1 });
    expect(db.prepare('select rating, missing from images where rel_path = ?').get('Позы/b.png')).toEqual({ rating: 1, missing: 0 });
  });

  test('imageCount ignores missing and disliked images', async () => {
    await syncLibrary(db, root);
    db.prepare("update images set rating = -1 where file_name = 'a.jpg'").run();
    expect(listTree(db).find((n) => n.name === 'Лица')!.imageCount).toBe(0);
  });

  test('indexes 10000 files in under 5 seconds', async () => {
    const big = tmpDir();
    for (let c = 0; c < 10; c++) {
      const dir = path.join(big, `cat${c}`);
      fs.mkdirSync(dir);
      for (let i = 0; i < 1000; i++) fs.writeFileSync(path.join(dir, `f${i}.jpg`), '');
    }
    const start = Date.now();
    const res = await syncLibrary(db, big);
    expect(res.addedImages).toBe(10000);
    expect(Date.now() - start).toBeLessThan(5000);
  }, 20000);
});
