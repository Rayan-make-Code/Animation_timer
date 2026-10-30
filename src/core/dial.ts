import type { Step } from './timer';

export type Phase = Step['kind'];

export interface Tick {
  /** Угол метки в градусах от верха по часовой стрелке (середина слота). */
  deg: number;
  phase: Phase;
  /** Длинная метка: внутри слота начинается отдых (цвет — отдыха). */
  long: boolean;
}

export const totalSec = (steps: Step[]): number => steps.reduce((a, s) => a + s.sec, 0);

/** Делит всё время сессии на n равных слотов; цвет — по фазе в середине слота. */
export function dialTicks(steps: Step[], n = 60): Tick[] {
  const total = totalSec(steps);
  const slot = total / n;
  const starts: number[] = [];
  let acc = 0;
  for (const s of steps) {
    starts.push(acc);
    acc += s.sec;
  }
  const ticks: Tick[] = Array.from({ length: n }, (_, i) => ({ deg: ((i + 0.5) * 360) / n, phase: 'work' as Phase, long: false }));
  if (total <= 0) return ticks;

  let si = 0;
  ticks.forEach((t, i) => {
    const mid = (i + 0.5) * slot;
    while (si < steps.length - 1 && starts[si] + steps[si].sec <= mid) si++;
    t.phase = steps[si].kind;
  });
  // Перерыв отмечается длинной зелёной засечкой, даже если в её слоте больше работы.
  steps.forEach((s, k) => {
    if (s.kind !== 'rest') return;
    const i = Math.min(n - 1, Math.floor((starts[k] * n) / total));
    ticks[i].long = true;
    ticks[i].phase = 'rest';
  });
  return ticks;
}

/** Общая длительность: минуты округляются вверх, но не меньше 1 мин. */
export function formatTotal(sec: number): string {
  const min = Math.max(1, Math.ceil(sec / 60));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/** Остаток времени вида «1 ч 2 мин 05 с» / «37 мин 15 с». */
export function formatClock(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h} ч ${m} мин ${ss} с` : `${m} мин ${ss} с`;
}

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
