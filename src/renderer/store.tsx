import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CategoryNode, Preset, QueueItem } from '../shared/api';

export interface ActiveSession { preset: Preset; queue: QueueItem[] }

interface Store {
  /** null — данные ещё загружаются. */
  presets: Preset[] | null;
  reloadPresets: () => Promise<Preset[]>;
  selectedPresetId: number | null;
  selectPreset: (id: number | null) => void;
  /** Путь к библиотеке или null, если папка не выбрана. */
  library: string | null;
  tree: CategoryNode[];
  reloadLibrary: () => Promise<void>;
  /** Выбранные категории (id). */
  selected: number[];
  toggleCategory: (id: number) => void;
  session: ActiveSession | null;
  setSession: (s: ActiveSession | null) => void;
  notice: string | null;
  setNotice: (n: string | null) => void;
  /** Первый запуск ещё не завершён (не было ни одного старта сессии). */
  firstRun: boolean;
  finishFirstRun: () => void;
  /** Итог последней сессии для блока «Старт». */
  finishedSummary: string | null;
  setFinishedSummary: (s: string | null) => void;
}

const Ctx = createContext<Store | null>(null);

/** Все id категорий дерева. */
const treeIds = (nodes: CategoryNode[]): Set<number> => {
  const ids = new Set<number>();
  const walk = (ns: CategoryNode[]) => ns.forEach((n) => { ids.add(n.id); walk(n.children); });
  walk(nodes);
  return ids;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [library, setLibrary] = useState<string | null>(null);
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [firstRun, setFirstRun] = useState(false);
  const [finishedSummary, setFinishedSummary] = useState<string | null>(null);

  const reloadPresets = useCallback(async () => {
    const list = await window.sketch.listPresets();
    setPresets(list);
    return list;
  }, []);

  const reloadLibrary = useCallback(async () => {
    const [state, nodes] = await Promise.all([window.sketch.getState(), window.sketch.getTree()]);
    setLibrary(state.library);
    setTree(nodes);
    // Устаревшие id (удалённые папки) отбрасываем.
    const ids = treeIds(nodes);
    setSelected((s) => (s.every((id) => ids.has(id)) ? s : s.filter((id) => ids.has(id))));
  }, []);

  useEffect(() => {
    void (async () => {
      const [settings, list, state, nodes] = await Promise.all([
        window.sketch.getSettings(), window.sketch.listPresets(), window.sketch.getState(), window.sketch.getTree(),
      ]);
      const ids = treeIds(nodes);
      setFirstRun(!settings.firstRunDone);
      setLibrary(state.library);
      setTree(nodes);
      setSelected(settings.selectedCategories.filter((id) => ids.has(id)));
      setPresets(list);
      setSelectedPresetId(list.some((p) => p.id === settings.selectedPreset) ? settings.selectedPreset : list[0]?.id ?? null);
    })();
  }, []);

  const selectPreset = useCallback((id: number | null) => {
    setSelectedPresetId(id);
    void window.sketch.saveSettings({ selectedPreset: id });
  }, []);

  const toggleCategory = useCallback((id: number) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    void window.sketch.saveSettings({ selectedCategories: next });
  }, [selected]);

  const finishFirstRun = useCallback(() => {
    setFirstRun(false);
    void window.sketch.saveSettings({ firstRunDone: true });
  }, []);

  return (
    <Ctx.Provider value={{
      presets, reloadPresets, selectedPresetId, selectPreset, library, tree, reloadLibrary, selected, toggleCategory,
      session, setSession, notice, setNotice, firstRun, finishFirstRun, finishedSummary, setFinishedSummary,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider отсутствует');
  return s;
}

/** Ошибки IPC приходят с технической приставкой Electron — убираем её. */
export const errorText = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
