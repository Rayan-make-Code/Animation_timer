import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { insideRoot } from '../../src/core/paths';

describe('insideRoot', () => {
  test('windows: library at a drive root', () => {
    expect(insideRoot('E:\\', 'E:\\Позы\\1.jpg', path.win32)).toBe(true);
    expect(insideRoot('E:\\', 'E:\\', path.win32)).toBe(false);
    expect(insideRoot('E:\\', 'D:\\Позы\\1.jpg', path.win32)).toBe(false);
  });

  test('windows: sibling folder with a common prefix is outside', () => {
    expect(insideRoot('C:\\Lib', 'C:\\Lib\\a\\1.jpg', path.win32)).toBe(true);
    expect(insideRoot('C:\\Lib', 'C:\\Lib-evil\\x', path.win32)).toBe(false);
    expect(insideRoot('C:\\Lib', 'C:\\Lib', path.win32)).toBe(false);
    expect(insideRoot('C:\\Lib', 'C:\\Lib\\..\\x', path.win32)).toBe(false);
  });

  test('windows: another drive is outside', () => {
    expect(insideRoot('C:\\Lib', 'D:\\Lib\\1.jpg', path.win32)).toBe(false);
  });

  test('posix: root and nested library', () => {
    expect(insideRoot('/', '/a/1.jpg', path.posix)).toBe(true);
    expect(insideRoot('/', '/', path.posix)).toBe(false);
    expect(insideRoot('/lib', '/lib/a/1.jpg', path.posix)).toBe(true);
    expect(insideRoot('/lib', '/lib-evil/x', path.posix)).toBe(false);
    expect(insideRoot('/lib', '/lib/../etc/passwd', path.posix)).toBe(false);
    expect(insideRoot('/lib', '/lib', path.posix)).toBe(false);
  });
});
