import { useEffect, useState } from 'react';
import type { Preset } from '../../shared/api';
import { formatClock, totalSec } from '../../core/dial';
import { expandPreset, totalWork } from '../../core/timer';
import { Icon, PlayIcon } from '../components';
import { errorText, useStore } from '../store';

/** Блок «Старт»: полоса цикла, сумма, правка и удаление пресета, запуск сессии. */
export function StartBar({ preset, onEdit, onDelete }: { preset: Preset | null; onEdit: () => void; onDelete: () => Promise<void> }) {
  const { library, tree, selected, session, setSession, setNotice, firstRun, finishFirstRun, finishedSummary, setFinishedSummary } = useStore();
  const [cycle, setCycle] = useState<{ remaining: number; total: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Пересчёт после смены категорий, обновления библиотеки и окончания сессии.
  useEffect(() => {
    if (!library || selected.length === 0) return setCycle(null);
    let live = true;
    window.sketch.cycleStatus(selected).then((c) => live && setCycle(c), () => live && setCycle(null));
    return () => { live = false; };
  }, [library, tree, selected, session]);
  useEffect(() => setConfirmDelete(false), [preset?.id]);

  const steps = preset ? expandPreset(preset) : [];
  const count = totalWork(steps);
  const blocked = !library ? 'Сначала выберите папку библиотеки'
    : selected.length === 0 ? 'Выберите хотя бы одну категорию'
      : !preset ? 'Сначала создайте пресет' : null;

  const start = async () => {
    if (blocked || !preset) return;
    try {
      const queue = await window.sketch.buildQueue(selected, count);
      if (firstRun) finishFirstRun();
      setFinishedSummary(null);
      await window.sketch.setFullscreen(true);
      setSession({ preset, queue });
    } catch (e) {
      setNotice(errorText(e));
    }
  };

  const viewed = cycle ? cycle.total - cycle.remaining : 0;
  const cycleText = cycle ? `цикл: осталось ${cycle.remaining} из ${cycle.total}` : 'цикл: категории не выбраны';

  return (
    <section className="start" aria-label="Старт">
      <div className="cycle-bar" role="progressbar" aria-label="Цикл выбранных категорий" aria-valuemin={0} aria-valuemax={cycle?.total ?? 0} aria-valuenow={viewed}
        data-tip={cycle ? `Цикл: осталось ${cycle.remaining} из ${cycle.total}` : 'Цикл: выберите категории'}>
        <div className="cycle-fill" style={{ height: cycle && cycle.total ? `${(viewed / cycle.total) * 100}%` : 0 }} />
      </div>
      {confirmDelete && preset ? (
        <>
          <div className="start-text"><span className="start-main">Удалить пресет?</span><span className="start-sub">{preset.name}</span></div>
          <button className="btn btn-danger" onClick={() => { setConfirmDelete(false); void onDelete(); }}>Да</button>
          <button className="btn" onClick={() => setConfirmDelete(false)}>Нет</button>
        </>
      ) : (
        <>
          <div className="start-text">
            <span className="start-main">{preset ? `${formatClock(totalSec(steps))} · ${count} рис.` : 'Нет пресета'}</span>
            <span className="start-sub">{cycleText}</span>
            {finishedSummary && <span className="start-sub done">{finishedSummary}</span>}
          </div>
          {preset && (
            <>
              <button className="icon-btn boxed" aria-label="Редактировать пресет" data-tip="Редактировать пресет" onClick={onEdit}><Icon name="edit" /></button>
              <button className="icon-btn boxed danger" aria-label="Удалить пресет" data-tip="Удалить пресет" onClick={() => setConfirmDelete(true)}><Icon name="trash" /></button>
            </>
          )}
          <button className="btn btn-primary start-btn" aria-disabled={blocked ? true : undefined} data-tip={blocked ?? undefined} onClick={() => void start()}>
            <PlayIcon />Старт
          </button>
        </>
      )}
    </section>
  );
}
