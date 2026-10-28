import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Preset, QueueItem } from '../shared/api';

export type Tab = 'library' | 'liked' | 'disliked' | 'presets' | 'setup';

export interface ActiveSession { preset: Preset; queue: QueueItem[] }

interface Store {
  tab: Tab;
  setTab: (t: Tab) => void;
  selected: number[];
  toggleCategory: (id: number) => void;
  session: ActiveSession | null;
  setSession: (s: ActiveSession | null) => void;
  notice: string | null;
  setNotice: (n: string | null) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('library');
  const [selected, setSelected] = useState<number[]>([]);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toggleCategory = useCallback((id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])), []);
  return <Ctx.Provider value={{ tab, setTab, selected, toggleCategory, session, setSession, notice, setNotice }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider отсутствует');
  return s;
}

/** Ошибки IPC приходят с технической приставкой Electron — убираем её. */
export const errorText = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
