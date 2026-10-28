import { useCallback, useEffect, useState } from 'react';
import type { AppState, CategoryNode } from '../../shared/api';
import { TreeView } from '../components';
import { errorText, useStore } from '../store';

export function Library() {
  const { setNotice } = useStore();
  const [state, setState] = useState<AppState | null>(null);
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setState(await window.sketch.getState());
    setTree(await window.sketch.getTree());
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const summary = (r: { sync: { addedImages: number; missing: number }; rename: { renamed: number; failed: unknown[] } }) =>
    `Новых изображений: ${r.sync.addedImages}, не найдено на диске: ${r.sync.missing}, переименовано: ${r.rename.renamed}` +
    (r.rename.failed.length ? `, ошибок переименования: ${r.rename.failed.length}` : '');

  return (
    <section>
      <h1>Библиотека</h1>
      {!state?.library ? (
        <div className="empty">
          <p>Выберите папку с изображениями. Папки первого уровня станут категориями, вложенные — подкатегориями. Сами файлы остаются на месте.</p>
          <button className="primary" disabled={busy} onClick={() => run(async () => {
            const r = await window.sketch.connectLibrary();
            return r ? summary(r) : null;
          })}>Выбрать папку</button>
        </div>
      ) : (
        <>
          <p className="muted ellipsis" title={state.library}>{state.library}</p>
          <div className="toolbar">
            <button disabled={busy} onClick={() => run(async () => summary(await window.sketch.syncLibrary()))}>Обновить</button>
            <button disabled={busy} onClick={() => run(async () => {
              const r = await window.sketch.renameNew();
              return `Переименовано: ${r.renamed}` + (r.failed.length ? `, ошибок: ${r.failed.length}` : '');
            })}>Переименовать</button>
            <button disabled={busy} onClick={() => run(async () => {
              const p = await window.sketch.exportBackup(false);
              return p ? `Резервная копия сохранена: ${p}` : null;
            })}>Резервная копия</button>
            <button disabled={busy} onClick={() => run(async () => {
              const r = await window.sketch.importBackup();
              if (!r) return null;
              return `Импорт: оценок применено ${r.ratingsApplied}, не найдено ${r.ratingsUnmatched.length}, пресетов добавлено ${r.presetsAdded}`;
            })}>Импорт оценок и пресетов</button>
            <button disabled={busy} onClick={() => run(async () => {
              const r = await window.sketch.connectLibrary();
              return r ? summary(r) : null;
            })}>Сменить папку</button>
          </div>
          {tree.length === 0 ? <p className="muted">В папке нет подходящих изображений.</p> : <TreeView nodes={tree} />}
        </>
      )}
    </section>
  );
}
