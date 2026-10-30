// Чистые операции со списком этапов пресета: каждая возвращает новый массив.
import type { Group } from './presetModel';

const inRange = (groups: Group[], i: number) => Number.isInteger(i) && i >= 0 && i < groups.length;

export function addGroup(groups: Group[]): Group[] {
  return [...groups, { repeats: 5, workLabel: 'Наброски', workSec: 60, restSec: 10 }];
}

export function duplicateGroup(groups: Group[], i: number): Group[] {
  if (!inRange(groups, i)) return groups.slice();
  const out = groups.slice();
  out.splice(i + 1, 0, { ...groups[i] });
  return out;
}

export function moveGroupUp(groups: Group[], i: number): Group[] {
  const out = groups.slice();
  if (!inRange(groups, i) || i === 0) return out;
  [out[i - 1], out[i]] = [out[i], out[i - 1]];
  return out;
}

export function removeGroup(groups: Group[], i: number): Group[] {
  if (!inRange(groups, i)) return groups.slice();
  return groups.filter((_, k) => k !== i);
}

// «M:SS» (SS 0..59) или целое число секунд; иначе null.
export function parseMmss(text: string): number | null {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(\d+):(\d{2})$/.exec(t);
  if (!m) return null;
  const ss = Number(m[2]);
  return ss <= 59 ? Number(m[1]) * 60 + ss : null;
}
