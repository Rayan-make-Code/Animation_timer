import { transaction, type Db } from './db';
import { getSetting, setSetting } from './settings';
import { listPresets, savePreset, type NewPreset } from './presets';

export const DEFAULT_PRESETS: NewPreset[] = [
  {
    name: '1 ч',
    description: 'наброски по минуте, отдых 15 секунд',
    groups: [
      { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 },
      { repeats: 48, workLabel: 'Наброски', workSec: 60, restSec: 15 },
    ],
  },
];

/** Версия набора стандартных пресетов; пресеты, добавленные позже, досыпаются в базу один раз. */
const DEFAULTS_REV = '2';
const REV1_NAMES = ['Разминка', 'Жесты 20', 'Длинная'];

/**
 * Создаёт стандартные пресеты, если пресетов ещё нет; у уже существующей базы один раз добавляет
 * новые стандартные пресеты, имена которых отсутствуют. Возвращает true, если что-то создал.
 */
export function seedDefaultPresets(db: Db): boolean {
  return transaction(db, () => {
    const existing = listPresets(db);
    if (existing.length === 0) {
      DEFAULT_PRESETS.forEach((p) => savePreset(db, p));
      setSetting(db, 'defaultsRev', DEFAULTS_REV);
      return true;
    }
    if (getSetting(db, 'defaultsRev') === DEFAULTS_REV) return false;
    const names = new Set(existing.map((p) => p.name));
    // Удалённые пользователем стандартные пресеты первой версии не возвращаем.
    const missing = DEFAULT_PRESETS.filter((p) => !REV1_NAMES.includes(p.name) && !names.has(p.name));
    missing.forEach((p) => savePreset(db, p));
    setSetting(db, 'defaultsRev', DEFAULTS_REV);
    return missing.length > 0;
  });
}
