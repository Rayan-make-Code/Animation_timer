import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { assertWritable, resolveDataDir } from '../../electron/paths';
import { tmpDir } from '../helpers';

describe('resolveDataDir', () => {
  test('packaged build keeps data next to the exe and ignores env overrides', () => {
    expect(resolveDataDir({ packaged: true, exeDir: '/apps/Sketch', appDir: '/x', env: { SKETCH_DATA_DIR: '/evil' } })).toBe(path.join('/apps/Sketch', 'data'));
  });
  test('development uses SKETCH_DATA_DIR when set', () => {
    expect(resolveDataDir({ packaged: false, exeDir: '/e', appDir: '/proj', env: { SKETCH_DATA_DIR: '/tmp/d' } })).toBe(path.resolve('/tmp/d'));
  });
  test('development falls back to <app>/data', () => {
    expect(resolveDataDir({ packaged: false, exeDir: '/e', appDir: '/proj', env: {} })).toBe(path.join('/proj', 'data'));
  });
});

describe('assertWritable', () => {
  test('creates a missing folder and leaves no temp file behind', () => {
    const dir = path.join(tmpDir(), 'data');
    assertWritable(dir);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
  test('throws a Russian message naming the folder when it cannot be written', () => {
    const file = path.join(tmpDir(), 'plain-file');
    fs.writeFileSync(file, '');
    expect(() => assertWritable(path.join(file, 'data'))).toThrow(/Нет доступа на запись[\s\S]*plain-file/);
  });
});
