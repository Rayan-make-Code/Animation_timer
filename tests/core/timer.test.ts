import { describe, expect, test } from 'vitest';
import { dropImage, expandPreset, SessionMachine, totalWork, type Step } from '../../src/core/timer';
import { categoryKey } from '../../src/core/presetModel';
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
    expect(steps.filter((s) => s.kind === 'rest')).toHaveLength(37); // после последнего повтора перерыва нет
    expect(steps.filter((s) => s.kind === 'work').map((s) => s.workIndex)).toEqual(Array.from({ length: 38 }, (_, i) => i));
  });

  test('a rest keeps the image of the work step before it', () => {
    const steps: Step[] = expandPreset({ name: 'p', description: '', groups: simple });
    expect(steps.map((s) => `${s.kind}${s.workIndex}`)).toEqual(['work0', 'rest0', 'work1', 'rest1', 'work2']);
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

const ids = (q: QueueItem[]) => q.map((x) => x.image.id);
const queueOf = (list: number[]) => list.map((id, i) => ({ ...item(id), cycle: 1 + Math.floor(i / 4) }));

describe('dropImage', () => {
  test('later entries of the image are replaced by the image of the queue seen farthest away', () => {
    const q = queueOf([1, 2, 3, 4, 1, 2, 3, 4]);
    const out = dropImage(q, 1, 0);
    expect(ids(out)).toEqual([1, 2, 3, 4, 3, 2, 3, 4]);
    // Замена — копия ближайшего предыдущего показа этого изображения: та же папка и цикл.
    expect(out[4]).toEqual(q[2]);
    expect(ids(q)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });

  test('entries up to and including the current one stay', () => {
    const q = queueOf([1, 2, 1, 3, 1]);
    expect(ids(dropImage(q, 1, 2))).toEqual([1, 2, 1, 3, 2]);
  });

  test('no other image in the queue: the queue ends at the current entry', () => {
    expect(ids(dropImage(queueOf([5, 5, 5]), 5, 0))).toEqual([5]);
  });

  test('nothing to replace: the same entries', () => {
    expect(ids(dropImage(queueOf([1, 2, 3]), 1, 0))).toEqual([1, 2, 3]);
  });
});

describe('SessionMachine.replaceImage', () => {
  function machineOf(list: number[], groups = simple) {
    const viewed: number[] = [];
    const machine = new SessionMachine(expandPreset({ name: 'p', description: '', groups }), queueOf(list), {
      onViewed: (q) => { viewed.push(q.image.id); return 0; },
      onUnviewed: () => {},
    });
    return { machine, viewed };
  }

  test('a disliked image does not come back later in the session', () => {
    const { machine, viewed } = machineOf([1, 2, 1], [{ repeats: 3, workLabel: 'W', workSec: 10, restSec: 0 }]);
    machine.replaceImage(1);
    machine.next();
    machine.tick(60_000);
    expect(viewed).toEqual([2, 2]);
    expect(machine.progress).toEqual({ done: 2, total: 3 });
  });

  test('when only the disliked image is left, the schedule ends after the current interval', () => {
    const { machine } = machineOf([7, 7, 7]);
    machine.replaceImage(7);
    expect(machine.progress.total).toBe(1);
    expect(machine.steps.every((s) => s.workIndex === 0)).toBe(true);
    machine.next();
    expect(machine.state).toBe('finished');
  });
});

describe('categories per preset and interval', () => {
  const base: NewPreset = {
    name: 'c',
    description: '',
    categoryIds: [1],
    groups: [
      { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 },
      { repeats: 2, workLabel: 'Позы', workSec: 60, restSec: 0 },
      { repeats: 1, workLabel: 'Лица', workSec: 60, restSec: 0, categoryIds: [7] },
    ],
  };

  test('an interval without its own categories takes the preset categories', () => {
    const steps = expandPreset(base);
    const work = steps.filter((s) => s.kind === 'work');
    expect(work.map((s) => s.categoryIds)).toEqual([[1], [1], [7]]);
  });

  test('the prepare step takes the categories of the first interval', () => {
    const steps = expandPreset({ ...base, groups: [{ ...base.groups[0], categoryIds: [9] }, base.groups[1]] });
    expect(steps[0]).toMatchObject({ kind: 'prepare', categoryIds: [1] });
  });

  test('categoryKey ignores the order of ids', () => {
    expect(categoryKey([3, 1])).toBe(categoryKey([1, 3]));
  });

  test('a replacement image comes from the same category set only', () => {
    const q = [
      { image: { id: 1 }, categoryId: 1, cycle: 1 },
      { image: { id: 2 }, categoryId: 7, cycle: 1 },
      { image: { id: 1 }, categoryId: 1, cycle: 1 },
      { image: { id: 3 }, categoryId: 7, cycle: 1 },
    ] as QueueItem[];
    const keys = ['1', '7', '1', '7'];
    // Первый показ 1 (set «1») заменяется другим изображением того же набора: другого в «1» нет — очередь обрывается.
    expect(ids(dropImage(q, 1, 0, (p) => keys[p]))).toEqual([1]);
  });
});
