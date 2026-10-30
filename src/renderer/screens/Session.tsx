import { useCallback, useEffect, useRef, useState } from 'react';
import { imageUrl } from '../../shared/api';
import { expandPreset, SessionMachine } from '../../core/timer';
import { mmss } from '../../core/dial';
import { BackIcon, ExitIcon, ForwardIcon, HeartIcon, PauseIcon, PlayIcon, UrnIcon } from '../icons';
import { playChime } from '../sound';
import { errorText, useStore } from '../store';

/** Сколько висит строка ошибки над панелью, мс. */
const ERROR_MS = 4000;

/** Полноэкранная сессия: изображение, полоса прогресса, «шторка» со временем и панель кнопок. */
export function Session() {
  const { session, setSession, setFinishedSummary } = useStore();
  const { preset, queue } = session!;
  const [, force] = useState(0);
  const [ratings, setRatings] = useState<Record<number, -1 | 0 | 1>>({});
  const [error, setError] = useState<string | null>(null);
  const leaving = useRef(false);
  const disliking = useRef(false);

  const machine = useRef<SessionMachine<Promise<number>>>();
  if (!machine.current) {
    machine.current = new SessionMachine<Promise<number>>(expandPreset(preset), queue, {
      onViewed: (item) => window.sketch.recordView(item.image.id, item.cycle),
      onUnviewed: (view) => { void view.then((id) => window.sketch.undoView(id)); },
    });
  }
  const m = machine.current;
  const rerender = useCallback(() => force((n) => n + 1), []);

  /** Возврат на главный экран; итог показывается только при естественном окончании. */
  const leave = useCallback(async (summary: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    if (summary) setFinishedSummary(`Сессия завершена: ${m.progress.done} рис.`);
    try {
      await window.sketch.setFullscreen(false);
    } finally {
      setSession(null);
    }
  }, [m, setSession, setFinishedSummary]);

  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      // После выхода время больше не идёт: ни просмотров, ни сигнала.
      if (leaving.current) return;
      const now = performance.now();
      if (m.tick(now - last) > 0) playChime();
      last = now;
      rerender();
    }, 100);
    return () => clearInterval(timer);
  }, [m, rerender]);

  const finished = m.state === 'finished';
  useEffect(() => {
    if (finished) void leave(true);
  }, [finished, leave]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), ERROR_MS);
    return () => clearTimeout(t);
  }, [error]);

  const like = useCallback(async () => {
    if (leaving.current) return;
    const id = m.currentImage.image.id;
    try {
      const next = await window.sketch.toggleRating(id, 1);
      setRatings((r) => ({ ...r, [id]: next }));
    } catch (e) {
      setError(errorText(e));
    }
  }, [m]);

  /** Дизлайк: к имени файла добавляется «_del», сразу следующее изображение; при ошибке остаёмся на месте. */
  const dislike = useCallback(async () => {
    if (disliking.current || leaving.current) return;
    disliking.current = true;
    const id = m.currentImage.image.id;
    try {
      await window.sketch.dislikeImage(id);
      // Изображение выбыло из сессий: дальше по очереди его заменяет другое.
      m.replaceImage(id);
      // Пока файл переименовывался, шаг мог смениться сам.
      if (m.currentImage.image.id === id) m.next();
      rerender();
    } catch (e) {
      setError(errorText(e));
    } finally {
      disliking.current = false;
    }
  }, [m, rerender]);

  const togglePause = useCallback(() => {
    if (leaving.current) return;
    if (m.state === 'paused') m.resume();
    else m.pause();
    rerender();
  }, [m, rerender]);

  /** Навигация вручную: игнорируется, пока сессия закрывается. */
  const go = useCallback((dir: 'next' | 'prev') => {
    if (leaving.current) return;
    if (dir === 'next') m.next();
    else m.prev();
    rerender();
  }, [m, rerender]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (m.state === 'finished' || leaving.current) return;
      const act: Record<string, () => void> = {
        ' ': togglePause,
        ArrowRight: () => go('next'),
        ArrowLeft: () => go('prev'),
        l: () => void like(),
        d: () => void dislike(),
        Escape: () => void leave(false),
      };
      const fn = act[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [m, like, dislike, leave, togglePause, go]);

  const { done, total } = m.progress;
  const image = m.currentImage.image;
  const liked = (ratings[image.id] ?? image.rating) === 1;
  const phase = m.step.kind;
  const paused = m.state === 'paused';

  return (
    <div className="session">
      <header className="session-head">
        <div className="session-progress" role="progressbar" aria-label="Прогресс сессии" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div className="session-progress-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        <div className="session-strip">
          <span className={`phase-dot ${phase}`} aria-hidden="true" />
          <span className="session-count">{done}/{total}</span>
          <span className="session-time">{mmss(Math.ceil(m.remainingMs / 1000))}</span>
        </div>
      </header>
      <div className="stage">
        <img
          key={image.id}
          className={`stage-img${phase === 'rest' ? ' dim' : ''}`}
          src={imageUrl(image.id)}
          alt={image.fileName}
          onError={() => go('next')}
        />
      </div>
      <div className="session-dock">
        {error && <div className="session-error" role="alert">{error}</div>}
        <div className="session-tools" role="toolbar" aria-label="Управление сессией">
          <button className="s-btn" aria-label="Предыдущее изображение" data-tip="Назад (←)" onClick={() => go('prev')}><BackIcon /></button>
          <button className="s-btn main" aria-label={paused ? 'Продолжить' : 'Пауза'} data-tip={paused ? 'Продолжить (Пробел)' : 'Пауза (Пробел)'} onClick={togglePause}>
            {paused ? <PlayIcon /> : <PauseIcon />}
          </button>
          <button className="s-btn" aria-label="Следующее изображение" data-tip="Вперёд (→)" onClick={() => go('next')}><ForwardIcon /></button>
          <button className={`s-btn like${liked ? ' on' : ''}`} aria-label="Лайк" aria-pressed={liked} data-tip="Лайк (L)" onClick={() => void like()}><HeartIcon /></button>
          <button className="s-btn dislike" aria-label="Дизлайк: убрать из сессий" data-tip="Дизлайк: пометить файл _del (D)" onClick={() => void dislike()}><UrnIcon /></button>
          <button className="s-btn" aria-label="Выйти из сессии" data-tip="Выйти (Esc)" onClick={() => void leave(false)}><ExitIcon /></button>
        </div>
      </div>
    </div>
  );
}
