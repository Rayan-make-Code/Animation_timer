import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { insideRoot } from './paths';

/** Переименование файла (в тестах подменяется, чтобы проверить ошибку). */
export type RenameFn = (from: string, to: string) => Promise<void>;

/** Имя файла с пометкой дизлайка: «…_del.png» или «…_del2.png», если имя было занято. */
export const isDislikedName = (name: string): boolean => /_del\d*(\.[^./\\]+)?$/i.test(name);

const splitExt = (name: string): [string, string] => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
};

const exists = async (p: string) => {
  try {
    await fs.promises.lstat(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * Дизлайк: файл остаётся в папке, но к имени добавляется «_del», а оценка становится -1.
 * Такие изображения не попадают в сессии и не переименовываются по шаблону папки.
 */
export async function dislikeImage(db: Db, root: string, imageId: number, rename: RenameFn = fs.promises.rename): Promise<void> {
  const row = db.prepare('select rel_path as relPath, file_name as fileName from images where id = ?').get(imageId) as { relPath: string; fileName: string } | undefined;
  if (!row) throw new Error(`Изображение ${imageId} не найдено`);
  const base = path.resolve(root);
  const abs = path.resolve(base, ...row.relPath.split('/'));
  if (!insideRoot(base, abs)) throw new Error('Путь вне папки библиотеки');

  let fileName = row.fileName;
  if (!isDislikedName(fileName)) {
    const [stem, ext] = splitExt(fileName);
    const dir = path.dirname(abs);
    fileName = `${stem}_del${ext}`;
    for (let n = 2; await exists(path.join(dir, fileName)); n++) fileName = `${stem}_del${n}${ext}`;
    try {
      await rename(abs, path.join(dir, fileName));
    } catch (e) {
      throw new Error(`Не удалось пометить файл: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const slash = row.relPath.lastIndexOf('/');
  const relPath = slash >= 0 ? `${row.relPath.slice(0, slash + 1)}${fileName}` : fileName;
  db.prepare('update images set file_name = ?, rel_path = ?, rating = -1 where id = ?').run(fileName, relPath, imageId);
}
