import { transaction, type Db } from './db';
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
];

/** Создаёт стандартные пресеты, только если пресетов ещё нет. Возвращает true, если создал. */
export function seedDefaultPresets(db: Db): boolean {
  return transaction(db, () => {
    if (listPresets(db).length > 0) return false;
    DEFAULT_PRESETS.forEach((p) => savePreset(db, p));
    return true;
  });
}
