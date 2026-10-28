import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { openDb } from '../../src/core/db';
import { syncLibrary } from '../../src/core/library';
import { planRenames, renameNewImages } from '../../src/core/rename';
import { makeFiles, tmpDir } from '../helpers';

describe('planRenames', () => {
  test('numbers new files from 01 keeping the extension', () => {
    expect(planRenames('Позы', ['x.jpg', 'y.PNG'], [])).toEqual([
      { from: 'x.jpg', to: 'Позы_img_01.jpg' },
      { from: 'y.PNG', to: 'Позы_img_02.PNG' },
    ]);
  });

  test('continues after the highest existing number', () => {
    const existing = ['Позы_img_01.jpg', 'Позы_img_05.jpg', 'x.jpg'];
    expect(planRenames('Позы', ['x.jpg'], existing)).toEqual([{ from: 'x.jpg', to: 'Позы_img_06.jpg' }]);
  });

  test('skips files that already follow the template', () => {
    expect(planRenames('Позы', ['Позы_img_03.jpg'], ['Позы_img_03.jpg'])).toEqual([]);
  });

  test('template match is case-insensitive and occupies the number', () => {
    expect(planRenames('Позы', ['x.jpg'], ['позы_IMG_01.JPG', 'x.jpg'])).toEqual([{ from: 'x.jpg', to: 'Позы_img_02.jpg' }]);
  });

  test('widens numbers past 99', () => {
    expect(planRenames('A', ['x.jpg'], ['A_img_99.jpg', 'x.jpg'])).toEqual([{ from: 'x.jpg', to: 'A_img_100.jpg' }]);
  });
});

describe('renameNewImages', () => {
  async function setup() {
    const db = openDb(':memory:');
    const root = tmpDir();
    makeFiles(root, { 'Позы/x.jpg': 'XXX', 'Позы/y.png': 'YYY', 'Лица/Мужские/z.webp': 'ZZZ' });
    await syncLibrary(db, root);
    return { db, root };
  }

  test('renames files, keeps bytes and updates the index', async () => {
    const { db, root } = await setup();
    const report = await renameNewImages(db, root);
    expect(report).toEqual({ renamed: 3, failed: [] });
    expect(fs.readFileSync(path.join(root, 'Позы', 'Позы_img_01.jpg'), 'utf8')).toBe('XXX');
    expect(fs.readFileSync(path.join(root, 'Лица', 'Мужские', 'Мужские_img_01.webp'), 'utf8')).toBe('ZZZ');
    expect(db.prepare("select rel_path from images where file_name = 'Позы_img_01.jpg'").get()).toEqual({ rel_path: 'Позы/Позы_img_01.jpg' });
  });

  test('a file lying directly in the library folder is renamed after that folder', async () => {
    const db = openDb(':memory:');
    const root = path.join(tmpDir(), 'madara');
    makeFiles(root, { 'madara_1.png': 'M' });
    await syncLibrary(db, root);
    expect(await renameNewImages(db, root)).toEqual({ renamed: 1, failed: [] });
    expect(fs.readFileSync(path.join(root, 'madara_img_01.png'), 'utf8')).toBe('M');
    expect(db.prepare('select rel_path from images').get()).toEqual({ rel_path: 'madara_img_01.png' });
  });

  test('a failure names the file that could not be renamed', async () => {
    const { db, root } = await setup();
    const real = fs.promises.rename;
    const spy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(from).endsWith('x.jpg')) throw new Error('EBUSY');
      return real(from, to);
    });
    const report = await renameNewImages(db, root);
    spy.mockRestore();
    expect(report.failed[0].path).toBe('Позы/x.jpg');
  });

  test('second run changes nothing', async () => {
    const { db, root } = await setup();
    await renameNewImages(db, root);
    expect(await renameNewImages(db, root)).toEqual({ renamed: 0, failed: [] });
  });

  test('never overwrites a file that appears at the target name', async () => {
    const { db, root } = await setup();
    // файл занимает целевое имя уже после сканирования
    makeFiles(root, { 'Позы/Позы_img_01.jpg': 'KEEP' });
    await renameNewImages(db, root);
    expect(fs.readFileSync(path.join(root, 'Позы', 'Позы_img_01.jpg'), 'utf8')).toBe('KEEP');
    const contents = fs.readdirSync(path.join(root, 'Позы')).map((f) => fs.readFileSync(path.join(root, 'Позы', f), 'utf8')).sort();
    expect(contents).toEqual(['KEEP', 'XXX', 'YYY']);
  });

  test('one failure is reported and the others still renamed', async () => {
    const { db, root } = await setup();
    const real = fs.promises.rename;
    const spy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(from).endsWith('x.jpg')) throw new Error('locked');
      return real(from, to);
    });
    const report = await renameNewImages(db, root);
    spy.mockRestore();
    expect(report.renamed).toBe(2);
    expect(report.failed).toEqual([{ path: 'Позы/x.jpg', error: 'locked' }]);
  });
});
