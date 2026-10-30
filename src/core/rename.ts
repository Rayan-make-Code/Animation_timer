import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { isDislikedName } from './dislike';

export interface RenamePlanItem { from: string; to: string }
export interface RenameReport { renamed: number; failed: { path: string; error: string }[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const extOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
};
const relOf = (dir: string, file: string) => (dir ? `${dir}/${file}` : file);
const pad = (n: number) => String(n).padStart(2, '0');

function templateRe(dir: string): RegExp {
  return new RegExp(`^${escape(dir)}_img_(\\d+)\\.[^.]+$`, 'i');
}

/**
 * Чистое планирование: dir — имя папки, files — файлы без нужного имени,
 * existing — все файлы папки (занятые имена и номера).
 */
export function planRenames(dir: string, files: string[], existing: string[]): RenamePlanItem[] {
  const re = templateRe(dir);
  let max = 0;
  for (const name of existing) {
    const m = re.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return files
    // Файлы с пометкой дизлайка («_del») сохраняют имя.
    .filter((f) => !re.test(f) && !isDislikedName(f))
    .map((from) => ({ from, to: `${dir}_img_${pad(++max)}${extOf(from)}` }));
}

const exists = async (p: string) => {
  try {
    await fs.promises.lstat(p);
    return true;
  } catch {
    return false;
  }
};

/** Переименовывает ещё не обработанные изображения во всех папках. Файлы никогда не перезаписываются. */
export async function renameNewImages(db: Db, root: string): Promise<RenameReport> {
  const report: RenameReport = { renamed: 0, failed: [] };
  const cats = db.prepare('select id, name, rel_path from categories').all() as { id: number; name: string; rel_path: string }[];
  const rows = db.prepare('select id, file_name from images where category_id = ? and missing = 0');
  const update = db.prepare('update images set file_name = ?, rel_path = ? where id = ?');

  for (const cat of cats) {
    const dirPath = path.join(root, ...cat.rel_path.split('/'));
    const images = rows.all(cat.id) as { id: number; file_name: string }[];
    const re = templateRe(cat.name);
    if (images.every((i) => re.test(i.file_name) || isDislikedName(i.file_name))) continue;

    let onDisk: string[];
    try {
      onDisk = await fs.promises.readdir(dirPath);
    } catch (e) {
      report.failed.push({ path: cat.rel_path || '.', error: (e as Error).message });
      continue;
    }
    const taken = new Set(onDisk.map((n) => n.toLowerCase()));
    const plan = planRenames(cat.name, images.map((i) => i.file_name), onDisk);
    const byName = new Map(images.map((i) => [i.file_name, i.id]));
    const re2 = templateRe(cat.name);
    let max = Math.max(0, ...onDisk.map((n) => Number(re2.exec(n)?.[1] ?? 0)));

    for (const item of plan) {
      let target = item.to;
      // Имя могло занять другое приложение уже после планирования: берём следующий свободный номер.
      while (taken.has(target.toLowerCase()) || (await exists(path.join(dirPath, target)))) {
        target = `${cat.name}_img_${pad(++max)}${extOf(item.from)}`;
      }
      try {
        await fs.promises.rename(path.join(dirPath, item.from), path.join(dirPath, target));
      } catch (e) {
        report.failed.push({ path: relOf(cat.rel_path, item.from), error: (e as Error).message });
        continue;
      }
      taken.add(target.toLowerCase());
      max = Math.max(max, Number(re2.exec(target)?.[1] ?? 0));
      update.run(target, relOf(cat.rel_path, target), byName.get(item.from)!);
      report.renamed++;
    }
  }
  return report;
}
