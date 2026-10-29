import { expect, test } from 'vitest';
import { expandPreset } from '../../src/core/timer';
import { dialTicks, formatClock, formatTotal, mmss, totalSec } from '../../src/core/dial';

const steps = expandPreset({ name: 'x', description: '', groups: [
  { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 },
  { repeats: 2, workLabel: 'Наброски', workSec: 60, restSec: 15 } ] });
test('returns n ticks spaced 360/n degrees starting at half a step', () => {
  const t = dialTicks(steps, 60);
  expect(t).toHaveLength(60);
  expect(t[0].deg).toBeCloseTo(3); expect(t[59].deg).toBeCloseTo(357);
});
test('colours a tick by the phase at its midpoint', () => {
  const t = dialTicks(steps, 60);           // total 155 s → slot ≈ 2.58 s
  expect(t[0].phase).toBe('prepare'); expect(t[3].phase).toBe('work');
  expect(t[59].phase).toBe('rest');
});
test('marks a tick long when a rest starts inside its slot', () => {
  const t = dialTicks(steps, 60);
  expect(t.filter((x) => x.long)).toHaveLength(2);
  expect(t.filter((x) => x.long).every((x) => x.phase === 'rest' || x.phase === 'work')).toBe(true);
});
test('keeps 60 ticks for a 3 h preset with 1 s rests', () => {
  const long = expandPreset({ name: 'l', description: '', groups: [{ repeats: 540, workLabel: 'w', workSec: 19, restSec: 1 }] });
  expect(dialTicks(long)).toHaveLength(60);
  expect(formatTotal(totalSec(long))).toBe('3 ч');
});
test('formats totals', () => {
  expect(formatTotal(35 * 60)).toBe('35 мин'); expect(formatTotal(80 * 60)).toBe('1 ч 20 мин');
  expect(formatTotal(30)).toBe('1 мин');     // rounds up, never «0 мин»
  expect(formatClock(2235)).toBe('37m 15s'); expect(formatClock(3725)).toBe('1h 2m 05s');
  expect(mmss(65)).toBe('1:05');
});
