import { beforeEach, describe, expect, test } from 'vitest';
import { openDb, type Db } from '../../src/core/db';
import { listByRating, recordView, setRating, toggleRating, undoView } from '../../src/core/ratings';

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  db.prepare("insert into categories(id, name, rel_path) values (1, 'A', 'A')").run();
  for (const [id, missing] of [[1, 0], [2, 0], [3, 1]]) {
    db.prepare('insert into images(id, category_id, rel_path, file_name, missing) values (?, 1, ?, ?, ?)').run(id, `A/${id}.jpg`, `${id}.jpg`, missing);
  }
});

describe('ratings', () => {
  test('toggling the same rating twice clears it', () => {
    expect(toggleRating(db, 1, 1)).toBe(1);
    expect(toggleRating(db, 1, 1)).toBe(0);
  });

  test('a dislike replaces a like', () => {
    toggleRating(db, 1, 1);
    expect(toggleRating(db, 1, -1)).toBe(-1);
    expect(listByRating(db, 1)).toEqual([]);
    expect(listByRating(db, -1).map((r) => r.id)).toEqual([1]);
  });

  test('listByRating hides missing files', () => {
    setRating(db, 2, 1);
    setRating(db, 3, 1);
    expect(listByRating(db, 1).map((r) => r.id)).toEqual([2]);
  });

  test('undoView removes only that view', () => {
    const a = recordView(db, 1, 1);
    recordView(db, 2, 1);
    undoView(db, a);
    expect(db.prepare('select image_id from views').all()).toEqual([{ image_id: 2 }]);
  });
});
