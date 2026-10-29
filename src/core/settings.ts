import type { Db } from './db';

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare('select value from settings where key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare('insert into settings(key, value) values (?, ?) on conflict(key) do update set value = excluded.value').run(key, value);
}

/** Разбор сохранённого списка id: неверный JSON или нецелые элементы отбрасываются. */
export function parseIds(raw: string | null): number[] {
  if (raw === null) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}
