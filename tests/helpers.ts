import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';

const dirs: string[] = [];

/** Временная папка, удаляемая после каждого теста. */
export function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sketch-'));
  dirs.push(dir);
  return dir;
}

/** Создаёт файлы (путь → содержимое) внутри папки, создавая вложенные каталоги. */
export function makeFiles(root: string, files: Record<string, string | Buffer>): void {
  for (const [rel, data] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
  }
}

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
});
