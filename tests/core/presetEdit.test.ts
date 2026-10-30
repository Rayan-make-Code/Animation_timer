import { describe, it, expect } from 'vitest';
import { addGroup, duplicateGroup, moveGroupUp, removeGroup, parseMmss } from '../../src/core/presetEdit';
import type { Group } from '../../src/core/presetModel';

const g = (n: number): Group => ({ repeats: n, workLabel: `L${n}`, workSec: n * 10, restSec: n });
const base = (): Group[] => [g(1), g(2), g(3)];

describe('addGroup', () => {
  it('добавляет этап по умолчанию в конец', () => {
    const input = base(); const before = structuredClone(input);
    const out = addGroup(input);
    expect(out).toHaveLength(4);
    expect(out[3]).toEqual({ repeats: 5, workLabel: 'Наброски', workSec: 60, restSec: 10 });
    expect(input).toEqual(before);
    expect(out).not.toBe(input);
  });
});

describe('duplicateGroup', () => {
  it('вставляет копию после i', () => {
    const input = base(); const before = structuredClone(input);
    const out = duplicateGroup(input, 1);
    expect(out).toEqual([g(1), g(2), g(2), g(3)]);
    expect(out[1]).not.toBe(out[2]);
    expect(input).toEqual(before);
  });
  it('индекс вне диапазона: без изменений', () => {
    expect(duplicateGroup(base(), 3)).toEqual(base());
    expect(duplicateGroup(base(), -1)).toEqual(base());
  });
});

describe('moveGroupUp', () => {
  it('меняет местами с предыдущим', () => {
    const input = base(); const before = structuredClone(input);
    expect(moveGroupUp(input, 2)).toEqual([g(1), g(3), g(2)]);
    expect(input).toEqual(before);
  });
  it('i=0 без изменений', () => { expect(moveGroupUp(base(), 0)).toEqual(base()); });
  it('индекс вне диапазона: без изменений', () => {
    expect(moveGroupUp(base(), 3)).toEqual(base());
    expect(moveGroupUp(base(), -1)).toEqual(base());
  });
});

describe('removeGroup', () => {
  it('удаляет этап', () => {
    const input = base(); const before = structuredClone(input);
    expect(removeGroup(input, 1)).toEqual([g(1), g(3)]);
    expect(input).toEqual(before);
  });
  it('индекс вне диапазона: без изменений', () => {
    expect(removeGroup(base(), 3)).toEqual(base());
    expect(removeGroup(base(), -1)).toEqual(base());
  });
});

describe('parseMmss', () => {
  it('разбирает M:SS и секунды', () => {
    expect(parseMmss('1:05')).toBe(65);
    expect(parseMmss('90')).toBe(90);
    expect(parseMmss('0:00')).toBe(0);
    expect(parseMmss(' 2:00 ')).toBe(120);
    expect(parseMmss('0')).toBe(0);
  });
  it('некорректный ввод даёт null', () => {
    for (const s of ['x', '1:75', '', ' ', '-5', '1:5x', '1:', ':30', '1.5', '1:2:3', '-1:30', '1:-5']) expect(parseMmss(s)).toBeNull();
  });
});
