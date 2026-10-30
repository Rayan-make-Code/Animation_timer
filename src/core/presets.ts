import { transaction, type Db } from './db';
import { validatePreset, type NewPreset, type Preset, type Group } from './presetModel';
import { parseIds } from './settings';

export { validatePreset } from './presetModel';
export type { Group, NewPreset, Preset } from './presetModel';

const json = (ids: number[] | undefined) => JSON.stringify(ids ?? []);

export function savePreset(db: Db, p: NewPreset & { id?: number }): number {
  const errors = validatePreset(p);
  if (errors.length) throw new Error(errors.join(' '));
  return transaction(db, () => {
    let id = p.id;
    if (id === undefined) {
      id = Number(db.prepare('insert into presets(name, description, category_ids) values (?, ?, ?)').run(p.name.trim(), p.description, json(p.categoryIds)).lastInsertRowid);
    } else {
      db.prepare('update presets set name = ?, description = ?, category_ids = ? where id = ?').run(p.name.trim(), p.description, json(p.categoryIds), id);
      db.prepare('delete from preset_groups where preset_id = ?').run(id);
    }
    const ins = db.prepare('insert into preset_groups(preset_id, position, repeats, work_label, work_sec, rest_sec, category_ids) values (?, ?, ?, ?, ?, ?, ?)');
    p.groups.forEach((g, i) => ins.run(id!, i, g.repeats, g.workLabel, g.workSec, g.restSec, json(g.categoryIds)));
    return id;
  });
}

/** Меняет только категории пресета (переключение тегов на главном экране). */
export function setPresetCategories(db: Db, id: number, categoryIds: number[]): void {
  const res = db.prepare('update presets set category_ids = ? where id = ?').run(json(categoryIds), id);
  if (Number(res.changes) === 0) throw new Error('Пресет не найден.');
}

export function listPresets(db: Db): Preset[] {
  const groups = db.prepare('select preset_id as pid, repeats, work_label as workLabel, work_sec as workSec, rest_sec as restSec, category_ids as cats from preset_groups order by preset_id, position').all() as (Omit<Group, 'categoryIds'> & { pid: number; cats: string })[];
  return (db.prepare('select id, name, description, category_ids as cats from presets order by id').all() as { id: number; name: string; description: string; cats: string }[]).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    categoryIds: parseIds(p.cats),
    groups: groups.filter((g) => g.pid === p.id).map(({ pid: _pid, cats, ...g }) => ({ ...g, categoryIds: parseIds(cats) })),
  }));
}

export function copyPreset(db: Db, id: number): number {
  const src = listPresets(db).find((p) => p.id === id);
  if (!src) throw new Error('Пресет не найден.');
  return savePreset(db, { name: `${src.name} (копия)`, description: src.description, categoryIds: src.categoryIds, groups: src.groups });
}

export function deletePreset(db: Db, id: number): void {
  db.prepare('delete from presets where id = ?').run(id);
}
