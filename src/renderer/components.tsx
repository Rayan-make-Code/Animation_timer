import { useStore } from './store';
import { imageUrl, type CategoryNode } from '../shared/api';

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export function Thumb({ id, alt }: { id: number; alt: string }) {
  return <img className="thumb" src={imageUrl(id)} alt={alt} loading="lazy" />;
}

/** Дерево категорий; при передаче selected показываются чекбоксы. */
export function TreeView({ nodes, selectable = false, depth = 0 }: { nodes: CategoryNode[]; selectable?: boolean; depth?: number }) {
  const { selected, toggleCategory } = useStore();
  return (
    <ul className="tree" role={depth === 0 ? 'tree' : 'group'}>
      {nodes.map((n) => (
        <li key={n.id} role="treeitem" aria-expanded={n.children.length ? true : undefined}>
          <div className="tree-row" style={{ paddingLeft: depth * 18 }}>
            {selectable && (
              <input type="checkbox" aria-label={`Категория ${n.name}`} checked={selected.includes(n.id)} disabled={n.imageCount === 0} onChange={() => toggleCategory(n.id)} />
            )}
            <span className="ellipsis">{n.name}</span>
            <span className="badge">{n.imageCount}</span>
          </div>
          {n.children.length > 0 && <TreeView nodes={n.children} selectable={selectable} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}
