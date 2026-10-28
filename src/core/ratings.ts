import type { Db } from './db';

export type Rating = -1 | 0 | 1;

export interface ImageRow {
  id: number;
  categoryId: number;
  relPath: string;
  fileName: string;
  rating: Rating;
  missing: boolean;
}

export const IMAGE_COLUMNS = 'id, category_id as categoryId, rel_path as relPath, file_name as fileName, rating, missing';

export function toImageRow(r: Record<string, unknown>): ImageRow {
  return { ...(r as unknown as ImageRow), missing: Boolean(r.missing) };
}

export function setRating(db: Db, imageId: number, rating: Rating): void {
  db.prepare('update images set rating = ? where id = ?').run(rating, imageId);
}

/** Повторное нажатие той же оценки снимает её. */
export function toggleRating(db: Db, imageId: number, target: 1 | -1): Rating {
  const row = db.prepare('select rating from images where id = ?').get(imageId) as { rating: Rating } | undefined;
  if (!row) throw new Error(`Изображение ${imageId} не найдено`);
  const next: Rating = row.rating === target ? 0 : target;
  setRating(db, imageId, next);
  return next;
}

export function listByRating(db: Db, rating: 1 | -1): ImageRow[] {
  return db.prepare(`select ${IMAGE_COLUMNS} from images where rating = ? and missing = 0 order by rel_path`).all(rating).map(toImageRow);
}

export function recordView(db: Db, imageId: number, cycle: number): number {
  const r = db.prepare('insert into views(image_id, cycle, completed_at) values (?, ?, ?)').run(imageId, cycle, new Date().toISOString());
  return Number(r.lastInsertRowid);
}

export function undoView(db: Db, viewId: number): void {
  db.prepare('delete from views where id = ?').run(viewId);
}
