import { describe, expect, test } from 'vitest';
import { expandPreset, SessionMachine, totalWork, type Step } from '../../src/core/timer';
import type { NewPreset } from '../../src/core/presets';
import type { QueueItem } from '../../src/core/picker';

const example: NewPreset = {
  name: 'Разминка',
  description: '',
  groups: [
    { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 },
    { repeats: 35, workLabel: 'Быстрые наброски', workSec: 60, restSec: 15 },
    { repeats: 2, workLabel: 'Формы', workSec: 180, restSec: 15 },
    { repeats: 1, workLabel: 'Конструкция', workSec: 300, restSec: 15 },
  ],
};

const item = (id: number): QueueItem => ({
  image: { id, categoryId: 1, relPath: `A/${id}.jpg`, fileName: `${id}.jpg`, rating: 0, missing: false },
  categoryId: 1,
  cycle: 1,
});

function setup(groups: NewPreset['groups'], n: number) {
  const viewed: number[] = [];
  const undone: number[] = [];
  let nextViewId = 100;
  const machine = new SessionMachine(expandPreset({ name: 'p', description: '', groups }), Array.from({ length: n }, (_, i) => item(i + 1)), {
    onViewed: (q) => { viewed.push(q.image.id); return nextViewId++; },
    onUnviewed: (viewId) => { undone.push(viewId); },
  });
  return { machine, viewed, undone };
}

const simple = [{ repeats: 3, workLabel: 'W', workSec: 10, restSec: 5 }];

describe('expandPreset', () => {
  test('example from the product description', () => {
    const steps = expandPreset(example);
    expect(steps[0]).toMatchObject({ kind: 'prepare', label: 'Приготовьтесь', sec: 5 });
    expect(steps.filter((s) => s.kind === 'work')).toHaveLength(38);
    expect(totalWork(steps)).toBe(38);
    expect(steps.filter((s) => s.kind === 'rest')).toHaveLength(38);
    expect(steps.filter((s) => s.kind === 'work').map((s) => s.workIndex)).toEqual(Array.from({ length: 38 }, (_, i) => i));
  });

  test('a rest keeps the image of the work step before it', () => {
    const steps: Step[] = expandPreset({ name: 'p', description: '', groups: simple });
    expect(steps.map((s) => `${s.kind}${s.workIndex}`)).toEqual(['work0', 'rest0', 'work1', 'rest1', 'work2', 'rest2']);
  });

  test('a single one-shot group is a real work step, not a preparation', () => {
    const steps = expandPreset({ name: 'p', description: '', groups: [{ repeats: 1, workLabel: 'W', workSec: 60, restSec: 0 }] });
    expect(steps.map((s) => s.kind)).toEqual(['work']);
  });

  test('zero rest creates no rest steps, and not-first group is not a preparation', () => {
    const steps = expandPreset({ name: 'p', description: '', groups: [{ repeats: 2, workLabel: 'W', workSec: 1, restSec: 0 }] });
    expect(steps.map((s) => s.kind)).toEqual(['work', 'work']);
  });
});

describe('SessionMachine', () => {
  test('finishing a work step records exactly one view and moves to rest', () => {
    const { machine, viewed } = setup(simple, 3);
    machine.tick(10_000);
    expect(viewed).toEqual([1]);
    expect(machine.step.kind).toBe('rest');
    expect(machine.progress).toEqual({ done: 1, total: 3 });
    machine.tick(2_000);
    expect(viewed).toEqual([1]);
    expect(machine.remainingMs).toBe(3_000);
  });

  test('pause freezes the countdown', () => {
    const { machine } = setup(simple, 3);
    machine.tick(4_000);
    machine.pause();
    machine.tick(60_000);
    expect(machine.remainingMs).toBe(6_000);
    expect(machine.state).toBe('paused');
    machine.resume();
    machine.tick(1_000);
    expect(machine.remainingMs).toBe(5_000);
  });

  test('next() skips without counting a view and skips the rest', () => {
    const { machine, viewed } = setup(simple, 3);
    machine.tick(3_000);
    machine.next();
    expect(viewed).toEqual([]);
    expect(machine.step).toMatchObject({ kind: 'work', workIndex: 1 });
    expect(machine.remainingMs).toBe(10_000);
    expect(machine.currentImage.image.id).toBe(2);
    expect(machine.progress.done).toBe(0);
  });

  test('prev() restores the previous image and rolls progress back one step', () => {
    const { machine, undone } = setup(simple, 3);
    machine.tick(10_000 + 5_000 + 3_000); // work0 done, rest done, inside work1
    expect(machine.progress.done).toBe(1);
    machine.prev();
    expect(machine.step).toMatchObject({ kind: 'work', workIndex: 0 });
    expect(machine.currentImage.image.id).toBe(1);
    expect(machine.progress.done).toBe(0);
    expect(undone).toEqual([100]);
    expect(machine.remainingMs).toBe(10_000);
  });

  test('prev() from a rest returns to the work step just finished', () => {
    const { machine, undone } = setup(simple, 3);
    machine.tick(10_000 + 1_000);
    machine.prev();
    expect(machine.step).toMatchObject({ kind: 'work', workIndex: 0 });
    expect(machine.progress.done).toBe(0);
    expect(undone).toEqual([100]);
  });

  test('prev() on the first work step does nothing', () => {
    const { machine } = setup(simple, 3);
    machine.tick(2_000);
    machine.prev();
    expect(machine.remainingMs).toBe(8_000);
  });

  test('a huge tick walks through several steps and finishes', () => {
    const { machine, viewed } = setup(simple, 3);
    machine.tick(10 * 60_000);
    expect(viewed).toEqual([1, 2, 3]);
    expect(machine.state).toBe('finished');
    expect(machine.progress).toEqual({ done: 3, total: 3 });
  });

  test('a preparation step shows the first image and counts nothing', () => {
    const { machine, viewed } = setup([{ repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 }, ...simple], 3);
    expect(machine.step.kind).toBe('prepare');
    expect(machine.currentImage.image.id).toBe(1);
    machine.tick(5_000);
    expect(viewed).toEqual([]);
    expect(machine.step).toMatchObject({ kind: 'work', workIndex: 0 });
    expect(machine.progress.total).toBe(3);
  });

  test('next() on the last work step finishes the session', () => {
    const { machine } = setup([{ repeats: 1, workLabel: 'W', workSec: 10, restSec: 0 }], 1);
    machine.next();
    expect(machine.state).toBe('finished');
  });

  test('finish() ends the session immediately', () => {
    const { machine } = setup(simple, 3);
    machine.finish();
    expect(machine.state).toBe('finished');
  });
});

describe('tick return value', () => {
  test('tick returns how many steps ended', () => {
    const { machine } = setup(
      [
        { repeats: 1, workLabel: 'P', workSec: 5, restSec: 0 },
        { repeats: 1, workLabel: 'W', workSec: 60, restSec: 0 },
      ],
      1,
    );
    expect(machine.tick(4000)).toBe(0);
    expect(machine.tick(2000)).toBe(1);
    expect(machine.tick(200000)).toBe(1);
    expect(machine.state).toBe('finished');
  });

  test('next() and prev() do not affect the count of subsequent ticks', () => {
    const { machine } = setup(simple, 3);
    machine.next();
    expect(machine.tick(10000)).toBe(1);
    machine.prev();
    expect(machine.tick(10000)).toBe(1);
  });
});
