import { transaction, type Db } from './db';
import { getSetting, setSetting } from './settings';
import { listPresets, savePreset, type NewPreset } from './presets';

export const DEFAULT_PRESETS: NewPreset[] = [
  {
    name: 'Разминка',
    description: 'подготовка, 35 быстрых набросков по минуте, формы и конструкция',
    groups: [
      { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 },
      { repeats: 35, workLabel: 'Быстрые наброски', workSec: 60, restSec: 15 },
      { repeats: 2, workLabel: 'Формы', workSec: 180, restSec: 15 },
      { repeats: 1, workLabel: 'Конструкция', workSec: 300, restSec: 15 },
    ],
  },
  {
    name: 'Жесты 20',
    description: 'короткие жесты на разогрев',
    groups: [{ repeats: 30, workLabel: 'Жест', workSec: 30, restSec: 10 }],
  },
  {
    name: 'Длинная',
    description: 'мало рисунков, много времени на каждый',
    groups: [
      { repeats: 10, workLabel: 'Позы', workSec: 120, restSec: 20 },
      { repeats: 3, workLabel: 'Проработка', workSec: 900, restSec: 60 },
    ],
  },
  // Частые по времени: набросок 1 мин, отдых 15 с; подготовка 5 с. Число повторов подобрано под сумму.
  ...[
    { name: '15 мин', description: 'наброски по минуте, отдых 15 секунд', repeats: 12 },
    { name: '30 мин', description: 'наброски по минуте, отдых 15 секунд', repeats: 24 },
    { name: '1 час', description: 'наброски по минуте, отдых 15 секунд', repeats: 48 },
  ].map(({ name, description, repeats }): NewPreset => ({
    name,
    description,
    groups: [
      { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 },
      { repeats, workLabel: 'Наброски', workSec: 60, restSec: 15 },
    ],
  })),
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
