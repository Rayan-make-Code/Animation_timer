import { useCallback, useEffect, useRef, useState } from 'react';
import { imageUrl } from '../../shared/api';
import { expandPreset, SessionMachine } from '../../core/timer';
import { mmss } from '../components';
import { errorText, useStore } from '../store';

export function Session() {
  const { session, setSession, setNotice } = useStore();
  const { preset, queue } = session!;
  const [, force] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const [ratings, setRatings] = useState<Record<number, -1 | 0 | 1>>({});

  const machine = useRef<SessionMachine<Promise<number>>>();
  if (!machine.current) {
    machine.current = new SessionMachine<Promise<number>>(expandPreset(preset), queue, {
      onViewed: (item) => window.sketch.recordView(item.image.id, item.cycle),
      onUnviewed: (view) => { void view.then((id) => window.sketch.undoView(id)); },
    });
  }
  const m = machine.current;
  const rerender = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      m.tick(now - last);
      last = now;
      rerender();
    }, 100);
    return () => clearInterval(timer);
  }, [m, rerender]);

  const leave = useCallback(async () => {
    await window.sketch.setFullscreen(false);
    setSession(null);
  }, [setSession]);

  const rate = useCallback(async (target: 1 | -1) => {
    const id = m.currentImage.image.id;
    try {
      const next = await window.sketch.toggleRating(id, target);
      setRatings((r) => ({ ...r, [id]: next }));
    } catch (e) {
      setNotice(errorText(e));
    }
  }, [m, setNotice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmExit) {
        if (e.key === 'Escape') setConfirmExit(false);
        return;
      }
      if (m.state === 'finished') return;
      const act: Record<string, () => void> = {
        ' ': () => (m.state === 'paused' ? m.resume() : m.pause()),
        ArrowRight: () => m.next(),
        ArrowLeft: () => m.prev(),
        l: () => void rate(1),
        d: () => void rate(-1),
        Escape: () => setConfirmExit(true),
      };
      const fn = act[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (fn) {
        e.preventDefault();
        fn();
        rerender();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [m, rate, rerender, confirmExit]);

  const { done, total } = m.progress;
  const finished = m.state === 'finished';
  const image = m.currentImage.image;
  const rating = ratings[image.id] ?? image.rating;
  const resting = m.step.kind === 'rest';

  return (
    <div className="session">
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Прогресс сессии">
        <div className="progress-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <div className="stage">
        <img
          key={image.id}
          className={`stage-img${resting ? ' dim' : ''}`}
          src={imageUrl(image.id)}
          alt={image.fileName}
          onError={() => { m.next(); rerender(); }}
        />
      </div>
      <aside className="side">
        {finished ? (
          <div className="done-box">
            <h2>Сессия завершена</h2>
            <p className="muted">Просмотрено: {done} из {total}</p>
            <button className="primary" onClick={leave}>Закрыть</button>
          </div>
        ) : (
          <>
            <div className={`timer${resting ? ' rest' : ''}`} aria-live="off">{mmss(Math.ceil(m.remainingMs / 1000))}</div>
            <div className="step-label">{m.step.label}</div>
            <div className="muted small">{done} / {total}{m.state === 'paused' ? ' · пауза' : ''}</div>
            <div className="controls">
              <button onClick={() => { m.state === 'paused' ? m.resume() : m.pause(); rerender(); }}>{m.state === 'paused' ? 'Продолжить' : 'Пауза'}</button>
              <button onClick={() => { m.prev(); rerender(); }} aria-label="Предыдущее">←</button>
              <button onClick={() => { m.next(); rerender(); }} aria-label="Следующее">→</button>
              <button className={rating === 1 ? 'like on' : 'like'} aria-pressed={rating === 1} onClick={() => rate(1)}>Лайк</button>
              <button className={rating === -1 ? 'dislike on' : 'dislike'} aria-pressed={rating === -1} onClick={() => rate(-1)}>Дизлайк</button>
              <button onClick={() => setConfirmExit(true)}>Завершить</button>
            </div>
          </>
        )}
        {confirmExit && (
          <div role="dialog" aria-label="Завершить сессию?" className="confirm">
            <p>Завершить сессию?</p>
            <button className="primary" onClick={leave}>Завершить</button>
            <button onClick={() => setConfirmExit(false)}>Продолжить</button>
          </div>
        )}
      </aside>
    </div>
  );
}
