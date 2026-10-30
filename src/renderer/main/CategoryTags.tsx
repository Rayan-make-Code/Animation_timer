import type { CategoryNode } from '../../shared/api';

export interface CategoryTag { id: number; name: string; sub: boolean }

/** Дерево → плоский список тегов: доступны все папки библиотеки, вложенные помечены как подкатегории. */
export function flattenTags(nodes: CategoryNode[], depth = 0): CategoryTag[] {
  return nodes.flatMap((n) => [{ id: n.id, name: n.name, sub: depth > 0 }, ...flattenTags(n.children, depth + 1)]);
}
