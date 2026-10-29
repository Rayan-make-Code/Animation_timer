import { useState } from 'react';
import type { RenameReport, SyncResult } from '../../shared/api';
import { Icon } from '../components';
import { errorText, useStore } from '../store';

const summary = (r: { sync: SyncResult; rename: RenameReport }) =>
  `Новых изображений: ${r.sync.addedImages}, не найдено на диске: ${r.sync.missing}, переименовано: ${r.rename.renamed}` +
  (r.rename.failed.length ? `, ошибок переименования: ${r.rename.failed.length}` : '');

/** Подвал: шестерёнка с панелью библиотеки и путь к папке. */
export function Footer({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { library, reloadLibrary, reloadPresets, setNotice } = useStore();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
      await reloadLibrary();
    }
  };
  const connect = () => run(async () => {
    const r = await window.sketch.connectLibrary();
    return r ? summary(r) : null;
  });

  return (
    <footer className="footer">
      {open && (
        <div className="lib-panel slide" role="toolbar" aria-label="Библиотека">
          <button className="btn small" data-tip="Обновить библиотеку" disabled={busy || !library} onClick={() => run(async () => summary(await window.sketch.syncLibrary()))}>Обновить</button>
          <button className="btn small" data-tip="Переименовать новые файлы" disabled={busy || !library} onClick={() => run(async () => {
            const r = await window.sketch.renameNew();
            return `Переименовано: ${r.renamed}` + (r.failed.length ? `, ошибок: ${r.failed.length}` : '');
          })}>Переименовать</button>
          <button className="btn small" data-tip="Сохранить оценки и пресеты в файл" disabled={busy} onClick={() => run(async () => {
            const p = await window.sketch.exportBackup(false);
            return p ? `Резервная копия сохранена: ${p}` : null;
          })}>Бэкап</button>
          <button className="btn small" data-tip="Загрузить оценки и пресеты из файла" disabled={busy} onClick={() => run(async () => {
            const r = await window.sketch.importBackup();
            if (!r) return null;
            await reloadPresets();
            return `Импорт: оценок применено ${r.ratingsApplied}, не найдено ${r.ratingsUnmatched.length}, пресетов добавлено ${r.presetsAdded}`;
          })}>Импорт</button>
        </div>
      )}
      <div className="footer-row">
        <button className={`icon-btn${open ? ' on' : ''}`} aria-label="Настройки библиотеки" data-tip="Настройки библиотеки" aria-expanded={open} onClick={onToggle}>
          <Icon name="sliders" size={16} />
        </button>
        <button className="lib-path" disabled={busy} aria-label={library ? 'Сменить папку библиотеки' : 'Выбрать папку библиотеки'}
          data-tip={library ? 'Сменить папку библиотеки' : 'Выбрать папку библиотеки'} onClick={() => void connect()}>
          <Icon name="folder" size={13} />
          <span className="ellipsis">{library ?? 'Папка не выбрана'}</span>
        </button>
      </div>
    </footer>
  );
}
