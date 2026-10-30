import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { isSupportedImage } from './formats';
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

/** Папка для файлов с дизлайком в корне библиотеки; в категории она не попадает. */
export const TRASH_DIR = 'trash';

/** Путь (с «/») лежит в папке trash или это она сама. */
export const isTrashPath = (rel: string): boolean => {
  const top = rel.split('/')[0].toLowerCase();
  return top === TRASH_DIR;
};

/** Переносит файл в trash под свободным именем с «_del»; возвращает новое имя. */
async function moveToTrash(base: string, relPath: string, name: string, rename: RenameFn): Promise<string> {
  const abs = path.resolve(base, ...relPath.split('/'));
  if (!insideRoot(base, abs)) throw new Error('Путь вне папки библиотеки');
  const trash = path.join(base, TRASH_DIR);
  const [stem, ext] = splitExt(name);
  const mark = isDislikedName(name) ? stem.replace(/_del\d*$/i, '') : stem;
  let fileName = `${mark}_del${ext}`;
  try {
    await fs.promises.mkdir(trash, { recursive: true });
    for (let n = 2; await exists(path.join(trash, fileName)); n++) fileName = `${mark}_del${n}${ext}`;
    await rename(abs, path.join(trash, fileName));
  } catch (e) {
    throw new Error(`Не удалось перенести файл в ${TRASH_DIR}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return fileName;
}

/**
 * Дизлайк: файл переносится в папку trash в корне библиотеки (создаётся при необходимости),
 * к имени добавляется «_del», оценка становится -1. В сессии и категории такие файлы не попадают.
 */
export async function dislikeImage(db: Db, root: string, imageId: number, rename: RenameFn = fs.promises.rename): Promise<void> {
  const row = db.prepare('select rel_path as relPath, file_name as fileName from images where id = ?').get(imageId) as { relPath: string; fileName: string } | undefined;
  if (!row) throw new Error(`Изображение ${imageId} не найдено`);
  const fileName = await moveToTrash(path.resolve(root), row.relPath, row.fileName, rename);
  db.prepare('update images set file_name = ?, rel_path = ?, rating = -1, missing = 1 where id = ?').run(fileName, `${TRASH_DIR}/${fileName}`, imageId);
}

export interface TrashReport { moved: number; failed: { path: string; error: string }[] }

/**
 * Файлы с пометкой «_del» вне trash (например, помеченные вручную) переносятся в trash,
 * их записи получают оценку -1 и выпадают из сессий. Запускается кнопкой «Обновить».
 */
export async function trashMarked(db: Db, root: string, rename: RenameFn = fs.promises.rename): Promise<TrashReport> {
  const base = path.resolve(root);
  const marked: string[] = [];
  const walk = async (rel: string) => {
    const dir = rel ? path.join(base, ...rel.split('/')) : base;
    for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!isTrashPath(r)) await walk(r);
      } else if (e.isFile() && isSupportedImage(e.name) && isDislikedName(e.name)) {
        marked.push(r);
      }
    }
  };
  await walk('');

  const report: TrashReport = { moved: 0, failed: [] };
  const update = db.prepare('update images set file_name = ?, rel_path = ?, rating = -1, missing = 1 where rel_path = ?');
  for (const rel of marked) {
    try {
      const fileName = await moveToTrash(base, rel, rel.slice(rel.lastIndexOf('/') + 1), rename);
      update.run(fileName, `${TRASH_DIR}/${fileName}`, rel);
      report.moved++;
    } catch (e) {
      report.failed.push({ path: rel, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}
