import path from 'node:path';
import type { Db } from './db';

/** Перемещает файл в корзину ОС (в приложении — shell.trashItem). */
export type TrashFn = (absPath: string) => Promise<void>;

/** Дизлайк: файл уходит в корзину, запись остаётся с пометкой missing, чтобы не попадать в очередь. */
export async function trashImage(db: Db, root: string, imageId: number, trash: TrashFn): Promise<void> {
  const row = db.prepare('select rel_path as relPath from images where id = ?').get(imageId) as { relPath: string } | undefined;
  if (!row) throw new Error(`Изображение ${imageId} не найдено`);
  const base = path.resolve(root);
  const abs = path.resolve(base, ...row.relPath.split('/'));
  const rel = path.relative(base, abs);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('Путь вне папки библиотеки');
  try {
    await trash(abs);
  } catch (e) {
    throw new Error(`Не удалось переместить в корзину: ${e instanceof Error ? e.message : String(e)}`);
  }
  db.prepare('update images set missing = 1 where id = ?').run(imageId);
}
