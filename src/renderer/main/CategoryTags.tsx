import type { CategoryNode } from '../../shared/api';
import { useStore } from '../store';

interface Tag { id: number; name: string; sub: boolean }

/** Дерево → плоский список тегов; папки без изображений не показываются. */
export function flattenTags(nodes: CategoryNode[], depth = 0): Tag[] {
  return nodes.flatMap((n) => [
    ...(n.imageCount > 0 ? [{ id: n.id, name: n.name, sub: depth > 0 }] : []),
    ...flattenTags(n.children, depth + 1),
  ]);
}

/** Теги категорий: голубые — верхний уровень, сиреневые — подкатегории. */
export function CategoryTags() {
  const { tree, selected, toggleCategory } = useStore();
  const tags = flattenTags(tree);
  if (tags.length === 0) return null;
  return (
    <section className="tags" role="group" aria-label="Категории">
      {tags.map((t) => (
        <button key={t.id} className={`chip${t.sub ? ' sub' : ''}`} aria-pressed={selected.includes(t.id)} onClick={() => toggleCategory(t.id)}>
          {t.name}
        </button>
      ))}
    </section>
  );
}
