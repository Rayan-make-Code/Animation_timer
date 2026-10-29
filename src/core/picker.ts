import type { Db } from './db';
import { IMAGE_COLUMNS, toImageRow, type ImageRow } from './ratings';

export const LIKE_WEIGHT = 3;

export interface QueueItem { image: ImageRow; categoryId: number; cycle: number }

export class EmptyPoolError extends Error {
  constructor() {
    super('В выбранных категориях нет доступных изображений.');
  }
}

/** Взвешенная случайная перестановка без возвращения: ключ -ln(u)/w, по возрастанию (Эфраимидис–Спиракис). */
export function weightedOrder<T>(items: T[], weight: (item: T) => number, rng: () => number = Math.random): T[] {
  return items
    .map((item) => ({ item, key: -Math.log(Math.max(rng(), Number.EPSILON)) / weight(item) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

const weightOf = (i: ImageRow) => (i.rating === 1 ? LIKE_WEIGHT : 1);

function descendants(db: Db, ids: number[]): number[] {
  const rows = db.prepare('select id, parent_id as parentId from categories').all() as { id: number; parentId: number | null }[];
  const result = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) {
      if (r.parentId !== null && result.has(r.parentId) && !result.has(r.id)) {
        result.add(r.id);
        grew = true;
      }
    }
  }
  return [...result];
}

/**
 * Общее правило цикла для buildQueue и cycleStatus: допустимые изображения (не пропавшие, не дизлайкнутые,
 * с подкатегориями), цикл каждой папки и ещё не просмотренные в нём; полностью просмотренная папка начинает новый цикл.
 */
function firstRound(db: Db, categoryIds: number[]): { eligible: ImageRow[]; base: Map<number, number>; round: QueueItem[] } {
  if (categoryIds.length === 0) return { eligible: [], base: new Map(), round: [] };
  const cats = descendants(db, categoryIds);
  const ph = cats.map(() => '?').join(',');
  const eligible = (db.prepare(`select ${IMAGE_COLUMNS} from images where category_id in (${ph}) and missing = 0 and rating != -1`).all(...cats))
    .map(toImageRow);

  const maxCycle = new Map<number, number>();
  for (const r of db.prepare(`select i.category_id as c, max(v.cycle) as m from views v join images i on i.id = v.image_id where i.category_id in (${ph}) group by i.category_id`).all(...cats) as { c: number; m: number }[]) {
    maxCycle.set(r.c, r.m);
  }
  const viewedInCycle = new Set<number>();
  for (const r of db.prepare(`select distinct v.image_id as id, v.cycle as cycle, i.category_id as c from views v join images i on i.id = v.image_id where i.category_id in (${ph})`).all(...cats) as { id: number; cycle: number; c: number }[]) {
    if (r.cycle === maxCycle.get(r.c)) viewedInCycle.add(r.id);
  }

  const byCat = new Map<number, ImageRow[]>();
  for (const img of eligible) byCat.set(img.categoryId, [...(byCat.get(img.categoryId) ?? []), img]);

  const base = new Map<number, number>();
  const round: QueueItem[] = [];
  for (const [catId, imgs] of byCat) {
    let cycle = maxCycle.get(catId) ?? 1;
    let pending = imgs.filter((i) => !viewedInCycle.has(i.id));
    if (pending.length === 0) {
      cycle += 1; // все изображения папки просмотрены: новый цикл
      pending = imgs;
    }
    base.set(catId, cycle);
    for (const image of pending) round.push({ image, categoryId: catId, cycle });
  }
  return { eligible, base, round };
}

/** Состояние цикла выбранных категорий: сколько изображений ещё не показано в текущем цикле и сколько всего. */
export function cycleStatus(db: Db, categoryIds: number[]): { remaining: number; total: number } {
  const { eligible, round } = firstRound(db, categoryIds);
  return { remaining: round.length, total: eligible.length };
}

/**
 * Очередь сессии: сначала изображения, не просмотренные в текущем цикле своей папки;
 * если очередь длиннее пула, начинается следующий круг (цикл + 1) без повторов внутри круга.
 */
export function buildQueue(db: Db, categoryIds: number[], count: number, rng: () => number = Math.random): QueueItem[] {
  const { eligible, base, round: firstRoundItems } = firstRound(db, categoryIds);
  if (eligible.length === 0) throw new EmptyPoolError();

  const queue = weightedOrder(firstRoundItems, (q) => weightOf(q.image), rng);
  for (let round = 1; queue.length < count; round++) {
    const next = eligible.map((image) => ({ image, categoryId: image.categoryId, cycle: base.get(image.categoryId)! + round }));
    queue.push(...weightedOrder(next, (q) => weightOf(q.image), rng));
  }
  return queue.slice(0, count);
}
