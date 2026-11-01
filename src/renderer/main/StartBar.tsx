import { useEffect, useRef, useState } from 'react';
import type { Preset } from '../../shared/api';
import { categoryKey } from '../../core/presetModel';
import { expandPreset } from '../../core/timer';
import { Icon, PlayIcon } from '../components';
import { errorText, useStore } from '../store';

/**
 * Запуск сессии по пресету: причина блокировки (или null) и сам запуск.
 * Общий для кнопки «Старт» под циферблатом и кнопки Play в подвале редактора.
 * beforeStart сохраняет открытый редактор и возвращает id пресета для запуска; null — сохранить не удалось, старт отменяется.
 * (Новый пресет получает id только при первом сохранении, поэтому id берётся после beforeStart.)
 */
export function useStart(preset: Preset | null, beforeStart: () => Promise<number | null>) {
  const { library, tree, session, setSession, setNotice, firstRun, finishFirstRun, setFinishedSummary } = useStore();
  // В наборе категорий каждого рабочего шага должны быть изображения; пустой набор блокирует старт.
  const [emptyPool, setEmptyPool] = useState(false);
  // Запуск уже идёт: повторный щелчок (двойной клик) игнорируется.
  const starting = useRef(false);

  const steps = preset ? expandPreset(preset) : [];
  // Категории каждого рабочего шага (в порядке очереди) и уникальные наборы для проверки.
  const slots = steps.filter((s) => s.kind === 'work').map((s) => s.categoryIds);
  const keys = [...new Set(slots.map(categoryKey))];
  const keyList = keys.join('|');
  const hasEmptySet = keys.includes('');

  // Пересчёт после смены категорий, обновления библиотеки и окончания сессии.
  useEffect(() => {
    if (!library || keys.length === 0 || hasEmptySet) return setEmptyPool(false);
    let live = true;
    const checks = keys.map((k) => window.sketch.cycleStatus(k.split(',').map(Number)).then((c) => c.total === 0, () => true));
    void Promise.all(checks).then((empties) => live && setEmptyPool(empties.some(Boolean)));
    return () => { live = false; };
  }, [library, tree, keyList, hasEmptySet, session]);

  const blocked = !library ? 'Сначала выберите папку библиотеки'
    : !preset ? 'Сначала создайте пресет'
      : hasEmptySet ? 'Выберите категории для пресета или отдельного этапа'
        : emptyPool ? 'В выбранных категориях нет изображений' : null;

  // Одно нажатие: сначала сохраняем открытый редактор, затем берём пресет из базы — с только что выбранными категориями.
  const start = async () => {
    if (!library || starting.current) return;
    starting.current = true;
    try {
      const id = await beforeStart();
      if (id == null) return;
      const fresh = (await window.sketch.listPresets()).find((p) => p.id === id);
      if (!fresh) return;
      const freshSlots = expandPreset(fresh).filter((s) => s.kind === 'work').map((s) => s.categoryIds);
      if (freshSlots.some((ids) => ids.length === 0)) return setNotice('Выберите категории для пресета или отдельного этапа');
      const queue = await window.sketch.buildQueue(freshSlots);
      if (firstRun) finishFirstRun();
      setFinishedSummary(null);
      await window.sketch.setFullscreen(true);
      setSession({ preset: fresh, queue });
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      starting.current = false;
    }
  };
  return { blocked, start };
}

/** Кнопки под циферблатом: правка пресета слева, запуск в центре, удаление справа. */
export function StartBar({ preset, onEdit, onDelete, beforeStart }: {
  preset: Preset | null;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  /** Сохраняет открытый редактор; false — сохранить не удалось, старт отменяется. */
  beforeStart: () => Promise<boolean>;
}) {
  const { finishedSummary } = useStore();
  const { blocked, start } = useStart(preset, async () => (preset && (await beforeStart()) ? preset.id : null));
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [preset?.id]);

  return (
    <section className="start" aria-label="Старт">
      {confirmDelete && preset ? (
        <div className="start-confirm">
          <span className="start-main">Удалить «{preset.name}»?</span>
          <button className="btn btn-danger" onClick={() => { setConfirmDelete(false); void onDelete(); }}>Да</button>
          <button className="btn" onClick={() => setConfirmDelete(false)}>Нет</button>
        </div>
      ) : (
        <div className="start-actions">
          {preset && <button className="icon-btn boxed" aria-label="Редактировать пресет" data-tip="Изменить" onClick={onEdit}><Icon name="edit" size={22} stroke={2} /></button>}
          <button className="icon-btn start-btn" aria-label="Старт" aria-disabled={blocked ? true : undefined} data-tip={blocked ?? 'Старт'} onClick={() => void start()}>
            <PlayIcon size={27} />
          </button>
          {preset && <button className="icon-btn boxed danger" aria-label="Удалить пресет" data-tip="Удалить" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={22} stroke={2} /></button>}
        </div>
      )}
      {finishedSummary && <span className="start-sub done">{finishedSummary}</span>}
    </section>
  );
}
