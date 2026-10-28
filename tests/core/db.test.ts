import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { openDb, SCHEMA_VERSION } from '../../src/core/db';
import { DatabaseSync } from '../../src/core/sqlite';
import { tmpDir } from '../helpers';

const tables = (db: DatabaseSync) =>
  (db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'").all() as { name: string }[])
    .map((r) => r.name).sort();

describe('openDb', () => {
  test('creates all tables in a fresh database', () => {
    const db = openDb(':memory:');
    expect(tables(db)).toEqual(['categories', 'images', 'preset_groups', 'presets', 'sessions', 'settings', 'views']);
    expect((db.prepare('pragma user_version').get() as { user_version: number }).user_version).toBe(SCHEMA_VERSION);
  });

  test('keeps data when the file is reopened', () => {
    const file = path.join(tmpDir(), 'sketch-timer.db');
    const first = openDb(file);
    first.prepare("insert into settings(key, value) values ('library', 'C:/img')").run();
    first.close();
    const second = openDb(file);
    expect(second.prepare("select value from settings where key = 'library'").get()).toEqual({ value: 'C:/img' });
  });

  test('refuses a database from a newer version', () => {
    const file = path.join(tmpDir(), 'new.db');
    const raw = new DatabaseSync(file);
    raw.exec('pragma user_version = 99');
    raw.close();
    expect(() => openDb(file)).toThrow(/слишком новая/);
  });

  test('deleting a preset removes its groups', () => {
    const db = openDb(':memory:');
    db.prepare("insert into presets(id, name, description) values (1, 'p', '')").run();
    db.prepare("insert into preset_groups(preset_id, position, repeats, work_label, work_sec, rest_sec) values (1, 0, 1, 'w', 60, 0)").run();
    db.prepare('delete from presets where id = 1').run();
    expect(db.prepare('select count(*) as c from preset_groups').get()).toEqual({ c: 0 });
  });
});
