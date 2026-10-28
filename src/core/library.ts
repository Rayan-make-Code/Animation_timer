import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './db';
import { isSupportedImage } from './formats';

export interface SyncResult { addedImages: number; addedCategories: number; missing: number; restored: number }

export interface CategoryNode {
  id: number;
  parentId: number | null;
  name: string;
  relPath: string;
  imageCount: number;
  children: CategoryNode[];
}

interface FoundImage { relPath: string; fileName: string; categoryRel: string; size: number; mtime: number }

/** Относительные пути хранятся с «/» на всех платформах, чтобы бэкап переносился между системами. */
const join = (a: string, b: string) => (a ? `${a}/${b}` : b);

async function walk(root: string, categoryRel: string, cats: Set<string>, images: FoundImage[]): Promise<void> {
  const dir = categoryRel ? path.join(root, ...categoryRel.split('/')) : root;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const rel = join(categoryRel, e.name);
      cats.add(rel);
      await walk(root, rel, cats, images);
    } else if (e.isFile() && categoryRel && isSupportedImage(e.name)) {
      const st = await fs.promises.stat(path.join(dir, e.name));
      images.push({ relPath: join(categoryRel, e.name), fileName: e.name, categoryRel, size: st.size, mtime: Math.floor(st.mtimeMs) });
    }
  }
}

export async function syncLibrary(db: Db, root: string): Promise<SyncResult> {
  const cats = new Set<string>();
  const found: FoundImage[] = [];
  await walk(root, '', cats, found);

  const res: SyncResult = { addedImages: 0, addedCategories: 0, missing: 0, restored: 0 };
  db.exec('begin');
  try {
    const catId = new Map<string, number>();
    for (const row of db.prepare('select id, rel_path from categories').all() as { id: number; rel_path: string }[]) catId.set(row.rel_path, row.id);
    const insertCat = db.prepare('insert into categories(parent_id, name, rel_path) values (?, ?, ?)');
    // Сортировка по длине гарантирует, что родитель вставляется раньше потомка.
    for (const rel of [...cats].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
      if (catId.has(rel)) continue;
      const slash = rel.lastIndexOf('/');
      const parent = slash < 0 ? null : catId.get(rel.slice(0, slash)) ?? null;
      const r = insertCat.run(parent, rel.slice(slash + 1), rel);
      catId.set(rel, Number(r.lastInsertRowid));
      res.addedCategories++;
    }

    const known = new Map<string, { id: number; missing: number }>();
    for (const row of db.prepare('select id, rel_path, missing from images').all() as { id: number; rel_path: string; missing: number }[]) {
      known.set(row.rel_path, { id: row.id, missing: row.missing });
    }
    const insertImg = db.prepare('insert into images(category_id, rel_path, file_name, size, mtime) values (?, ?, ?, ?, ?)');
    const restore = db.prepare('update images set missing = 0, size = ?, mtime = ? where id = ?');
    const seen = new Set<string>();
    for (const f of found) {
      seen.add(f.relPath);
      const k = known.get(f.relPath);
      if (!k) {
        insertImg.run(catId.get(f.categoryRel)!, f.relPath, f.fileName, f.size, f.mtime);
        res.addedImages++;
      } else if (k.missing) {
        restore.run(f.size, f.mtime, k.id);
        res.restored++;
      }
    }
    const markMissing = db.prepare('update images set missing = 1 where id = ?');
    for (const [rel, k] of known) {
      if (!seen.has(rel) && !k.missing) {
        markMissing.run(k.id);
        res.missing++;
      }
    }
    db.exec('commit');
  } catch (e) {
    db.exec('rollback');
    throw e;
  }
  return res;
}

export function listTree(db: Db): CategoryNode[] {
  const cats = db.prepare('select id, parent_id as parentId, name, rel_path as relPath from categories order by name').all() as Omit<CategoryNode, 'imageCount' | 'children'>[];
  const counts = new Map<number, number>();
  for (const r of db.prepare('select category_id as id, count(*) as c from images where missing = 0 and rating != -1 group by category_id').all() as { id: number; c: number }[]) counts.set(r.id, r.c);
  const nodes = new Map<number, CategoryNode>(cats.map((c) => [c.id, { ...c, imageCount: counts.get(c.id) ?? 0, children: [] }]));
  const roots: CategoryNode[] = [];
  for (const n of nodes.values()) (n.parentId === null ? roots : nodes.get(n.parentId)!.children).push(n);
  const total = (n: CategoryNode): number => (n.imageCount += n.children.reduce((s, c) => s + total(c), 0));
  roots.forEach(total);
  return roots;
}
