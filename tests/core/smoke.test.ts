import { expect, test } from 'vitest';
import { DatabaseSync } from '../../src/core/sqlite';

test('node:sqlite is available', () => {
  const db = new DatabaseSync(':memory:');
  expect(db.prepare('select 1 as x').get()).toEqual({ x: 1 });
});
