import type { QueueItem } from './picker';
import type { NewPreset } from './presetModel';

export interface Step {
  kind: 'prepare' | 'work' | 'rest';
  label: string;
  sec: number;
  /** Индекс рабочего интервала, чьё изображение показывается (у отдыха — предыдущего рабочего). */
  workIndex: number;
}

/**
 * Пресет → линейный список шагов. Первая группа с одним повтором и без отдыха (если есть и другие группы) — «приготовьтесь»:
 * показывает первое изображение, но не засчитывается и не входит в прогресс.
 */
export function expandPreset(p: NewPreset): Step[] {
  const steps: Step[] = [];
  let work = 0;
  p.groups.forEach((g, gi) => {
    if (gi === 0 && p.groups.length > 1 && g.repeats === 1 && g.restSec === 0) {
      steps.push({ kind: 'prepare', label: g.workLabel, sec: g.workSec, workIndex: 0 });
      return;
    }
    for (let r = 0; r < g.repeats; r++) {
      steps.push({ kind: 'work', label: g.workLabel, sec: g.workSec, workIndex: work });
      if (g.restSec > 0) steps.push({ kind: 'rest', label: 'Отдых', sec: g.restSec, workIndex: work });
      work++;
    }
  });
  return steps;
}

export const totalWork = (steps: readonly Step[]): number => steps.filter((s) => s.kind === 'work').length;

export interface SessionHooks<H = number> {
  /** Вызывается один раз по окончании рабочего интервала; возвращает id записи для отката. */
  onViewed(item: QueueItem): H;
  onUnviewed(handle: H): void;
}

/**
 * Дизлайкнутое изображение не должно вернуться позже в той же сессии (очередь повторяет пул, если изображений мало).
 * Его записи после позиции after заменяются другим изображением этой же очереди — тем, чей ближайший показ дальше всего;
 * замена копирует ближайший предыдущий показ (папка и цикл те же). Если других изображений нет, очередь обрывается на after.
 */
export function dropImage(queue: QueueItem[], imageId: number, after: number): QueueItem[] {
  const out = [...queue];
  const others = [...new Set(queue.filter((q) => q.image.id !== imageId).map((q) => q.image.id))];
  for (let j = after + 1; j < out.length; j++) {
    if (out[j].image.id !== imageId) continue;
    if (others.length === 0) return out.slice(0, after + 1);
    const spots = (id: number) => out.flatMap((q, i) => (q.image.id === id ? [i] : []));
    let best = others[0];
    let bestDist = -1;
    for (const id of others) {
      const dist = Math.min(...spots(id).map((i) => Math.abs(i - j)));
      if (dist > bestDist) [best, bestDist] = [id, dist];
    }
    const at = spots(best);
    const before = at.filter((i) => i < j);
    out[j] = out[before.length ? before[before.length - 1] : at[0]];
  }
  return out;
}

export type SessionState = 'running' | 'paused' | 'finished';

export class SessionMachine<H = number> {
  state: SessionState = 'running';
  stepIndex = 0;
  remainingMs: number;
  private views = new Map<number, H>();
  private _steps: Step[];
  private _queue: QueueItem[];

  constructor(steps: Step[], queue: QueueItem[], private hooks: SessionHooks<H>) {
    this._steps = steps;
    this._queue = queue;
    this.remainingMs = steps[0].sec * 1000;
  }

  get steps(): readonly Step[] {
    return this._steps;
  }

  get queue(): readonly QueueItem[] {
    return this._queue;
  }

  /** Изображение ушло в корзину: дальше по очереди его заменяет другое; если заменить нечем, расписание укорачивается. */
  replaceImage(imageId: number): void {
    this._queue = dropImage(this._queue, imageId, this.step.workIndex);
    this._steps = this._steps.filter((s) => s.workIndex < this._queue.length);
  }

  get step(): Step {
    return this.steps[this.stepIndex];
  }

  get currentImage(): QueueItem {
    return this.queue[this.step.workIndex];
  }

  get progress(): { done: number; total: number } {
    return { done: this.views.size, total: totalWork(this.steps) };
  }

  /** Время течёт только в состоянии running; elapsedMs можно передавать большими порциями. Возвращает число шагов, закончившихся по времени. */
  tick(elapsedMs: number): number {
    let left = elapsedMs;
    let completed = 0;
    while (left > 0 && this.state === 'running') {
      if (left < this.remainingMs) {
        this.remainingMs -= left;
        break;
      }
      left -= this.remainingMs;
      this.completeStep();
      completed++;
    }
    return completed;
  }

  pause(): void {
    if (this.state === 'running') this.state = 'paused';
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'running';
  }

  finish(): void {
    this.state = 'finished';
  }

  /** Пропуск: просмотр не засчитывается, отдых пропускается. */
  next(): void {
    if (this.state === 'finished') return;
    const target = this.steps.findIndex((s, i) => i > this.stepIndex && s.kind === 'work');
    if (target < 0) this.finish();
    else this.goTo(target);
  }

  /** Назад: возвращает предыдущее изображение и снимает отметку просмотра на один шаг. */
  prev(): void {
    if (this.state === 'finished') return;
    const cur = this.step;
    const targetWork = cur.kind === 'rest' ? cur.workIndex : cur.kind === 'work' ? cur.workIndex - 1 : -1;
    if (targetWork < 0) return;
    const handle = this.views.get(targetWork);
    if (this.views.has(targetWork)) {
      this.hooks.onUnviewed(handle as H);
      this.views.delete(targetWork);
    }
    this.goTo(this.steps.findIndex((s) => s.kind === 'work' && s.workIndex === targetWork));
  }

  private goTo(index: number): void {
    this.stepIndex = index;
    this.remainingMs = this.step.sec * 1000;
  }

  private completeStep(): void {
    if (this.step.kind === 'work') {
      this.views.set(this.step.workIndex, this.hooks.onViewed(this.queue[this.step.workIndex]));
    }
    if (this.stepIndex + 1 >= this.steps.length) {
      this.remainingMs = 0;
      this.finish();
    } else {
      this.goTo(this.stepIndex + 1);
    }
  }
}
