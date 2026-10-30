import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** Категории выбранного пресета (id); переключаются тегами на главном экране. */
  selected: number[];
  toggleCategory: (id: number) => Promise<void>;
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

export function StoreProvider({ children }: { children: ReactNode }) {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [library, setLibrary] = useState<string | null>(null);
  const [tree, setTree] = useState<CategoryNode[]>([]);
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
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [settings, list, state, nodes] = await Promise.all([
          window.sketch.getSettings(), window.sketch.listPresets(), window.sketch.getState(), window.sketch.getTree(),
        ]);
        setFirstRun(!settings.firstRunDone);
        setLibrary(state.library);
        setTree(nodes);
        setPresets(list);
        setSelectedPresetId(list.some((p) => p.id === settings.selectedPreset) ? settings.selectedPreset : list[0]?.id ?? null);
      } catch (e) {
        // Без этого главный экран так и остался бы пустым без объяснений.
        setNotice(`Не удалось загрузить данные: ${errorText(e)}`);
      }
    })();
  }, []);

  const selectPreset = useCallback((id: number | null) => {
    setSelectedPresetId(id);
    void window.sketch.saveSettings({ selectedPreset: id });
  }, []);

  // Категории принадлежат пресету: переключение сразу сохраняется в его записи.
  const selected = presets?.find((p) => p.id === selectedPresetId)?.categoryIds ?? [];
  // Переключения идут по очереди: каждое читает список пресетов свежим, как и сохранение открытого редактора.
  const toggleChain = useRef<Promise<void>>(Promise.resolve());
  const toggleCategory = useCallback((id: number): Promise<void> => {
    const run = async () => {
      const list = await window.sketch.listPresets();
      const preset = list.find((p) => p.id === selectedPresetId);
      if (!preset) return;
      const current = preset.categoryIds ?? [];
      await window.sketch.setPresetCategories(preset.id, current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
      await reloadPresets();
    };
    toggleChain.current = toggleChain.current.then(run, run).catch((e) => setNotice(errorText(e)));
    return toggleChain.current;
  }, [selectedPresetId, reloadPresets]);

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
