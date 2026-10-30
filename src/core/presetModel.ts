// Чистая модель пресета без зависимостей от базы: используется и в renderer.
/** Интервал. categoryIds — свои категории интервала; пусто — берутся категории пресета. */
export interface Group { repeats: number; workLabel: string; workSec: number; restSec: number; categoryIds?: number[] }
/** categoryIds — категории всего пресета (id папок библиотеки). */
export interface NewPreset { name: string; description: string; categoryIds?: number[]; groups: Group[] }
export interface Preset extends NewPreset { id: number }

/** Категории, из которых тянется изображение интервала: свои, если заданы, иначе категории пресета. */
export const groupCategories = (p: NewPreset, g: Group): number[] => (g.categoryIds?.length ? g.categoryIds : p.categoryIds ?? []);

/** Ключ набора категорий: одинаковые наборы в разном порядке дают одну очередь. */
export const categoryKey = (ids: readonly number[]): string => [...ids].sort((a, b) => a - b).join(',');

export function validatePreset(p: NewPreset): string[] {
  const errors: string[] = [];
  if (!p.name.trim()) errors.push('Укажите название пресета.');
  if (p.groups.length === 0) errors.push('Добавьте хотя бы один этап.');
  p.groups.forEach((g, i) => {
    const n = i + 1;
    if (!Number.isInteger(g.repeats) || g.repeats < 1) errors.push(`Этап ${n}: число повторов должно быть целым и не меньше 1.`);
    if (!Number.isInteger(g.workSec) || g.workSec < 1) errors.push(`Этап ${n}: длительность упражнения должна быть не меньше 1 секунды.`);
    if (!Number.isInteger(g.restSec) || g.restSec < 0) errors.push(`Этап ${n}: отдых не может быть отрицательным.`);
  });
  return errors;
}
