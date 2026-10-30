import { beforeEach, describe, expect, test } from 'vitest';
import { openDb, type Db } from '../../src/core/db';
import { buildQueue, buildSessionQueue, cycleStatus, EmptyPoolError, LIKE_WEIGHT, weightedOrder } from '../../src/core/picker';
import { recordView, setRating } from '../../src/core/ratings';

/** Детерминированный генератор (mulberry32). */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  db.prepare("insert into categories(id, parent_id, name, rel_path) values (1, null, 'A', 'A'), (2, 1, 'Sub', 'A/Sub'), (3, null, 'B', 'B')").run();
  const ins = db.prepare('insert into images(id, category_id, rel_path, file_name, rating, missing) values (?, ?, ?, ?, ?, ?)');
  // A: 1..5, A/Sub: 6..7, B: 8..9
  for (let id = 1; id <= 5; id++) ins.run(id, 1, `A/${id}.jpg`, `${id}.jpg`, 0, 0);
  for (let id = 6; id <= 7; id++) ins.run(id, 2, `A/Sub/${id}.jpg`, `${id}.jpg`, 0, 0);
  for (let id = 8; id <= 9; id++) ins.run(id, 3, `B/${id}.jpg`, `${id}.jpg`, 0, 0);
});

const ids = (q: { image: { id: number } }[]) => q.map((i) => i.image.id);

describe('buildQueue', () => {
  test('includes subcategories and never repeats within a cycle', () => {
    const q = buildQueue(db, [1], 7, seeded(1));
    expect(ids(q).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('skips disliked and missing images', () => {
    db.prepare('update images set rating = -1 where id = 1').run();
    db.prepare('update images set missing = 1 where id = 2').run();
    expect(ids(buildQueue(db, [1], 5, seeded(2))).sort()).toEqual([3, 4, 5, 6, 7]);
  });

  test('prefers images not yet viewed in the current cycle', () => {
    for (const id of [1, 2, 3]) recordView(db, id, 1);
    const q = buildQueue(db, [1], 2, seeded(3));
    expect(ids(q).every((id) => [4, 5, 6, 7].includes(id))).toBe(true);
  });

  test('starts a new cycle for a fully viewed category', () => {
    for (const id of [8, 9]) recordView(db, id, 1);
    const q = buildQueue(db, [3], 2, seeded(4));
    expect(ids(q).sort()).toEqual([8, 9]);
    expect(q.every((i) => i.cycle === 2)).toBe(true);
  });

  test('asking for more than the pool starts another round without repeats inside a round', () => {
    const q = buildQueue(db, [3], 4, seeded(5));
    expect(q).toHaveLength(4);
    expect(new Set(ids(q.slice(0, 2))).size).toBe(2);
    expect(new Set(ids(q.slice(2, 4))).size).toBe(2);
    expect(q.slice(0, 2).every((i) => i.cycle === 1)).toBe(true);
    expect(q.slice(2).every((i) => i.cycle === 2)).toBe(true);
  });

  test('throws EmptyPoolError when nothing is available', () => {
    db.prepare('update images set rating = -1 where category_id = 3').run();
    expect(() => buildQueue(db, [3], 3)).toThrow(EmptyPoolError);
  });
});

describe('weightedOrder', () => {
  test('a liked item comes first about LIKE_WEIGHT times more often than a plain one', () => {
    const rng = seeded(42);
    const items = [{ id: 'like', w: LIKE_WEIGHT }, { id: 'a', w: 1 }, { id: 'b', w: 1 }, { id: 'c', w: 1 }];
    const firsts: Record<string, number> = { like: 0, a: 0, b: 0, c: 0 };
    for (let i = 0; i < 20000; i++) firsts[weightedOrder(items, (x) => x.w, rng)[0].id]++;
    const plain = (firsts.a + firsts.b + firsts.c) / 3;
    expect(firsts.like / plain).toBeGreaterThan(LIKE_WEIGHT * 0.85);
    expect(firsts.like / plain).toBeLessThan(LIKE_WEIGHT * 1.15);
  });
});

describe('cycleStatus', () => {
  test('fresh library: everything remains, subcategories included', () => {
    expect(cycleStatus(db, [1])).toEqual({ remaining: 7, total: 7 });
  });

  test('a recorded view decreases remaining', () => {
    recordView(db, 1, 1);
    expect(cycleStatus(db, [1])).toEqual({ remaining: 6, total: 7 });
  });

  test('fully viewed category resets to the full count', () => {
    for (const id of [8, 9]) recordView(db, id, 1);
    expect(cycleStatus(db, [3])).toEqual({ remaining: 2, total: 2 });
  });

  test('sums several categories', () => {
    recordView(db, 8, 1);
    expect(cycleStatus(db, [1, 3])).toEqual({ remaining: 8, total: 9 });
  });

  test('disliked and missing images are excluded from both numbers', () => {
    setRating(db, 1, -1);
    db.prepare('update images set missing = 1 where id = 2').run();
    recordView(db, 3, 1);
    expect(cycleStatus(db, [1])).toEqual({ remaining: 4, total: 5 });
  });

  test('empty selection gives zeros', () => {
    expect(cycleStatus(db, [])).toEqual({ remaining: 0, total: 0 });
  });
});

describe('buildSessionQueue', () => {
  test('each interval draws only from its own categories', () => {
    const q = buildSessionQueue(db, [[3], [1], [3], [1, 3]], seeded(5));
    expect(q).toHaveLength(4);
    // Категория 1 включает подкатегорию 2; категория 3 — только себя.
    expect(q[0].categoryId).toBe(3);
    expect([1, 2]).toContain(q[1].categoryId);
    expect(q[2].categoryId).toBe(3);
    expect([1, 2, 3]).toContain(q[3].categoryId);
  });

  test('intervals with the same set share one cycle order, so there are no repeats within it', () => {
    const q = buildSessionQueue(db, [[3], [3]], seeded(7));
    expect(new Set(ids(q)).size).toBe(2);
  });

  test('an interval with no categories cannot be filled', () => {
    expect(() => buildSessionQueue(db, [[3], []], seeded(1))).toThrow(EmptyPoolError);
  });
});
