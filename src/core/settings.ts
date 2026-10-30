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

export interface Settings { selectedPreset: number | null; firstRunDone: boolean }

/** Сохранённые настройки главного экрана. Первый запуск пройден, если стоит флаг или (обновление с 0.1) уже подключена библиотека. */
export function readSettings(db: Db): Settings {
  const raw = getSetting(db, 'selectedPreset');
  const preset = raw ? Number(raw) : NaN;
  return {
    selectedPreset: Number.isInteger(preset) ? preset : null,
    firstRunDone: getSetting(db, 'firstRunDone') === '1' || !!getSetting(db, 'library'),
  };
}
