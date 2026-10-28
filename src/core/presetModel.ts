// Чистая модель пресета без зависимостей от базы: используется и в renderer.
export interface Group { repeats: number; workLabel: string; workSec: number; restSec: number }
export interface NewPreset { name: string; description: string; groups: Group[] }
export interface Preset extends NewPreset { id: number }

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
