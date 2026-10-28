import type { Db } from './db';

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

export function savePreset(db: Db, p: NewPreset & { id?: number }): number {
  const errors = validatePreset(p);
  if (errors.length) throw new Error(errors.join(' '));
  db.exec('begin');
  try {
    let id = p.id;
    if (id === undefined) {
      id = Number(db.prepare('insert into presets(name, description) values (?, ?)').run(p.name.trim(), p.description).lastInsertRowid);
    } else {
      db.prepare('update presets set name = ?, description = ? where id = ?').run(p.name.trim(), p.description, id);
      db.prepare('delete from preset_groups where preset_id = ?').run(id);
    }
    const ins = db.prepare('insert into preset_groups(preset_id, position, repeats, work_label, work_sec, rest_sec) values (?, ?, ?, ?, ?, ?)');
    p.groups.forEach((g, i) => ins.run(id!, i, g.repeats, g.workLabel, g.workSec, g.restSec));
    db.exec('commit');
    return id;
  } catch (e) {
    db.exec('rollback');
    throw e;
  }
}

export function listPresets(db: Db): Preset[] {
  const groups = db.prepare('select preset_id as pid, repeats, work_label as workLabel, work_sec as workSec, rest_sec as restSec from preset_groups order by preset_id, position').all() as unknown as (Group & { pid: number })[];
  return (db.prepare('select id, name, description from presets order by id').all() as { id: number; name: string; description: string }[]).map((p) => ({
    ...p,
    groups: groups.filter((g) => g.pid === p.id).map(({ pid: _pid, ...g }) => g),
  }));
}

export function copyPreset(db: Db, id: number): number {
  const src = listPresets(db).find((p) => p.id === id);
  if (!src) throw new Error('Пресет не найден.');
  return savePreset(db, { name: `${src.name} (копия)`, description: src.description, groups: src.groups });
}

export function deletePreset(db: Db, id: number): void {
  db.prepare('delete from presets where id = ?').run(id);
}
