import { transaction, type Db } from './db';
import { listPresets, savePreset, type Group, type NewPreset, type Preset } from './presets';

export const BACKUP_FORMAT = 'sketch-timer-backup';
export const BACKUP_VERSION = 1;

export class BackupError extends Error {}

export interface RatingEntry { relPath: string; fileName: string; size: number; rating: 1 | -1 }
export interface ViewEntry { relPath: string; cycle: number; completedAt: string }
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  ratings: RatingEntry[];
  presets: Preset[];
  views?: ViewEntry[];
}
export interface ImportReport { ratingsApplied: number; ratingsUnmatched: string[]; presetsAdded: number }

export function exportBackup(db: Db, opts: { includeViews: boolean }): BackupFile {
  const ratings = db.prepare('select rel_path as relPath, file_name as fileName, size, rating from images where rating != 0 order by rel_path').all() as unknown as RatingEntry[];
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), ratings, presets: listPresets(db) };
  if (opts.includeViews) {
    file.views = db.prepare('select i.rel_path as relPath, v.cycle as cycle, v.completed_at as completedAt from views v join images i on i.id = v.image_id order by v.id').all() as unknown as ViewEntry[];
  }
  return file;
}

function parse(data: unknown): BackupFile {
  if (typeof data !== 'object' || data === null) throw new BackupError('Файл не похож на резервную копию MIYP Timer.');
  const d = data as Partial<BackupFile>;
  if (d.format !== BACKUP_FORMAT) throw new BackupError('Файл не похож на резервную копию MIYP Timer.');
  if (typeof d.version !== 'number' || d.version > BACKUP_VERSION) {
    throw new BackupError('Резервная копия создана более новой версией приложения и не может быть импортирована.');
  }
  if (!Array.isArray(d.ratings) || !Array.isArray(d.presets)) throw new BackupError('Резервная копия повреждена.');
  return d as BackupFile;
}

/** Переносит оценки и пресеты (не сами изображения). Всё или ничего: при ошибке база не меняется. */
export function importBackup(db: Db, data: unknown): ImportReport {
  const file = parse(data);
  const report: ImportReport = { ratingsApplied: 0, ratingsUnmatched: [], presetsAdded: 0 };

  return transaction(db, () => {
    const byPath = db.prepare('select id from images where rel_path = ?');
    const byNameSize = db.prepare('select id from images where file_name = ? and size = ?');
    const apply = db.prepare('update images set rating = ? where id = ?');
    for (const r of file.ratings) {
      if (typeof r?.relPath !== 'string' || (r.rating !== 1 && r.rating !== -1)) throw new BackupError('Резервная копия повреждена.');
      let hit = byPath.get(r.relPath) as { id: number } | undefined;
      if (!hit) {
        const candidates = byNameSize.all(r.fileName, r.size) as { id: number }[];
        if (candidates.length === 1) hit = candidates[0]; // неоднозначные совпадения не применяем
      }
      if (hit) {
        apply.run(r.rating, hit.id);
        report.ratingsApplied++;
      } else {
        report.ratingsUnmatched.push(r.relPath);
      }
    }

    const taken = new Set(listPresets(db).map((p) => p.name));
    for (const p of file.presets) {
      // Категории в файле — id папок другой библиотеки, поэтому при импорте их не переносим.
      const preset: NewPreset = {
        name: String(p?.name ?? ''),
        description: String(p?.description ?? ''),
        groups: Array.isArray(p?.groups) ? p.groups.map((g: Group) => ({ ...g, categoryIds: [] })) : [],
      };
      if (taken.has(preset.name)) preset.name = `${preset.name} (импорт)`;
      try {
        savePreset(db, preset);
      } catch (e) {
        throw new BackupError(`Резервная копия содержит неверный пресет: ${(e as Error).message}`);
      }
      taken.add(preset.name);
      report.presetsAdded++;
    }
    return report;
  });
}
