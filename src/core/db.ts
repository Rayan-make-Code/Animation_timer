import { DatabaseSync } from './sqlite';

export type Db = DatabaseSync;

/** Миграции: элемент i переводит базу с версии i на версию i + 1. */
const MIGRATIONS: ((db: Db) => void)[] = [
  (db) => {
    db.exec(`
      create table settings(key text primary key, value text not null);
      create table categories(
        id integer primary key,
        parent_id integer references categories(id) on delete cascade,
        name text not null,
        rel_path text not null unique
      );
      create table images(
        id integer primary key,
        category_id integer not null references categories(id) on delete cascade,
        rel_path text not null unique,
        file_name text not null,
        rating integer not null default 0 check (rating in (-1, 0, 1)),
        size integer not null default 0,
        mtime integer not null default 0,
        missing integer not null default 0
      );
      create index images_category on images(category_id);
      create table views(
        id integer primary key,
        image_id integer not null references images(id) on delete cascade,
        cycle integer not null,
        completed_at text not null
      );
      create index views_image on views(image_id);
      create table presets(
        id integer primary key,
        name text not null,
        description text not null default ''
      );
      create table preset_groups(
        id integer primary key,
        preset_id integer not null references presets(id) on delete cascade,
        position integer not null,
        repeats integer not null,
        work_label text not null,
        work_sec integer not null,
        rest_sec integer not null
      );
      create table sessions(
        id integer primary key,
        started_at text not null,
        ended_at text,
        preset_id integer references presets(id) on delete set null,
        state_json text not null default '{}'
      );
    `);
  },
  // Категории пресета и отдельные категории интервала (JSON-массив id папок).
  (db) => {
    db.exec(`
      alter table presets add column category_ids text not null default '[]';
      alter table preset_groups add column category_ids text not null default '[]';
    `);
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function openDb(file: string): Db {
  const db = new DatabaseSync(file);
  const version = (db.prepare('pragma user_version').get() as { user_version: number }).user_version;
  if (version > SCHEMA_VERSION) {
    db.close();
    throw new Error(`База данных создана более новой версией приложения (версия схемы ${version}): она слишком новая для этой сборки.`);
  }
  db.exec('pragma foreign_keys = on');
  if (file !== ':memory:') db.exec('pragma journal_mode = wal');
  for (let v = version; v < SCHEMA_VERSION; v++) {
    db.exec('begin');
    try {
      MIGRATIONS[v](db);
      db.exec(`pragma user_version = ${v + 1}`);
      db.exec('commit');
    } catch (e) {
      db.exec('rollback');
      throw e;
    }
  }
  return db;
}

let savepointId = 0;

/** Транзакция через SAVEPOINT: безопасно вкладывается (например, savePreset внутри importBackup). */
export function transaction<T>(db: Db, fn: () => T): T {
  const name = `sp${++savepointId}`;
  db.exec(`savepoint ${name}`);
  try {
    const result = fn();
    db.exec(`release ${name}`);
    return result;
  } catch (e) {
    db.exec(`rollback to ${name}`);
    db.exec(`release ${name}`);
    throw e;
  }
}
