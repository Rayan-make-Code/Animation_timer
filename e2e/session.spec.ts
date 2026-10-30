import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launch, makeLibrary, query } from './helpers';

/** Запуск сессии через главный экран: пресет «Тест» с категорией «Позы», «Старт». */
async function prepare(durationSec: number, repeats: number, opts: { restSec?: number; dblclick?: boolean } = {}) {
  const lib = makeLibrary();
  const run = await launch(undefined, lib);
  const { win } = run;
  await win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  // Дерево категорий готово только после сводки синхронизации.
  await expect(win.getByRole('status')).toContainText('Библиотека:');
  const id = await win.evaluate(async ([sec, rep, rest]) => {
    const poses = (await window.sketch.getTree()).find((n) => n.name === 'Позы')!.id;
    return window.sketch.savePreset({
      name: 'Тест', description: '', categoryIds: [poses], groups: [{ repeats: rep, workLabel: 'Наброски', workSec: sec, restSec: rest }],
    });
  }, [durationSec, repeats, opts.restSec ?? 0]);
  await win.evaluate((presetId) => window.sketch.saveSettings({ selectedPreset: presetId }), id);
  // Перезагрузка подхватывает новый пресет и выбор.
  await win.reload();
  await win.waitForSelector('.app');
  await expect(win.getByRole('button', { name: /^Тест/ })).toHaveAttribute('aria-pressed', 'true');
  const startBounds = await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const start = win.getByRole('button', { name: 'Старт', exact: true });
  await expect(start).toBeEnabled();
  if (opts.dblclick) await start.dblclick();
  else await start.click();
  await expect(win.getByRole('progressbar', { name: 'Прогресс сессии' })).toBeVisible();
  return { ...run, lib, startBounds };
}

/** Файлы «Позы» с пометкой дизлайка. */
const marked = (lib: string) => fs.readdirSync(path.join(lib, 'Позы')).filter((n) => /_del\d*\./.test(n));

const time = (win: Page) => win.locator('.session-time');
const image = (win: Page) => win.locator('.stage-img');
const views = (dataDir: string) => query<{ c: number }>(dataDir, 'select count(*) as c from views')[0].c;

test('a finished session records a view for every completed interval', async () => {
  const { app, win, dataDir } = await prepare(1, 2);
  await expect(win.getByText('Сессия завершена: 2 рис.')).toBeVisible({ timeout: 10_000 });
  await expect(win.getByRole('button', { name: 'Старт', exact: true })).toBeVisible();
  expect(views(dataDir)).toBe(2);
  await app.close();
});

test('skipping does not count, going back restores the previous image', async () => {
  const { app, win, dataDir } = await prepare(60, 3);
  const first = await image(win).getAttribute('src');
  await win.getByRole('button', { name: 'Следующее изображение' }).click();
  await expect(image(win)).not.toHaveAttribute('src', first!);
  expect(views(dataDir)).toBe(0);
  await win.getByRole('button', { name: 'Предыдущее изображение' }).click();
  await expect(image(win)).toHaveAttribute('src', first!);
  await expect(time(win)).toHaveText('1:00');
  await app.close();
});

test('space pauses the countdown', async () => {
  const { app, win } = await prepare(60, 1);
  await win.keyboard.press(' ');
  await expect(win.getByRole('button', { name: 'Продолжить' })).toBeVisible();
  const before = await time(win).textContent();
  await win.waitForTimeout(1500);
  await expect(time(win)).toHaveText(before!);
  await win.keyboard.press(' ');
  await expect(win.getByRole('button', { name: 'Пауза' })).toBeVisible();
  await app.close();
});

test('L likes and pressing again removes the like', async () => {
  const { app, win, dataDir } = await prepare(60, 1);
  const like = win.getByRole('button', { name: 'Лайк', exact: true });
  const rating = () => query<{ r: number }>(dataDir, 'select max(rating) as r from images')[0].r;
  await win.keyboard.press('l');
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(rating).toBe(1);
  await win.keyboard.press('l');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(rating).toBe(0);
  await app.close();
});

test('D marks the file with _del, keeps it on disk and shows the next image', async () => {
  const { app, win, dataDir, lib } = await prepare(60, 3);
  const first = await image(win).getAttribute('src');
  await win.keyboard.press('d');
  await expect(image(win)).not.toHaveAttribute('src', first!);
  expect(marked(lib)).toHaveLength(1);
  expect(query<{ c: number }>(dataDir, "select count(*) as c from images where rating = -1 and file_name like '%\\_del%' escape '\\'")[0].c).toBe(1);
  await expect(win.getByRole('progressbar', { name: 'Прогресс сессии' })).toBeVisible();
  await app.close();
});

test('a disliked image does not come back later in the same session', async () => {
  // В «Позах» меньше изображений, чем интервалов: очередь повторяет их.
  const { app, win } = await prepare(60, 8);
  const first = await image(win).getAttribute('src');
  await win.keyboard.press('d');
  await expect(image(win)).not.toHaveAttribute('src', first!);
  await expect(win.locator('.session-count')).toHaveText('0/8');
  for (let i = 1; i < 8; i++) {
    await expect(image(win)).not.toHaveAttribute('src', first!);
    await win.keyboard.press('ArrowRight');
  }
  await expect(win.getByText('Сессия завершена: 0 рис.')).toBeVisible();
  await app.close();
});

test('D on the last image marks it and finishes the session', async () => {
  const { app, win, lib } = await prepare(60, 1);
  await win.getByRole('button', { name: 'Дизлайк: убрать из сессий' }).click();
  await expect(win.getByText('Сессия завершена: 0 рис.')).toBeVisible();
  expect(marked(lib)).toHaveLength(1);
  await app.close();
});

test('a failed rename shows an error and keeps the image', async () => {
  const { app, win, dataDir, lib } = await prepare(60, 3);
  const first = await image(win).getAttribute('src');
  // Файл текущего изображения пропал с диска: переименовать его не получится.
  const rel = query<{ rel: string }>(dataDir, `select rel_path as rel from images where id = ${Number(first!.split('/').pop())}`)[0].rel;
  fs.rmSync(path.join(lib, ...rel.split('/')));
  await win.keyboard.press('d');
  await expect(win.getByRole('alert')).toContainText('Не удалось пометить файл');
  await expect(image(win)).toHaveAttribute('src', first!);
  expect(query<{ c: number }>(dataDir, 'select count(*) as c from images where rating = -1')[0].c).toBe(0);
  await expect(win.getByRole('alert')).toHaveCount(0, { timeout: 8_000 });
  await app.close();
});

test('Escape leaves immediately and returns to the main screen', async () => {
  // Двойной щелчок по «Старт» не должен сбить размер окна, который восстанавливается после выхода.
  const { app, win, startBounds } = await prepare(60, 1, { dblclick: true });
  await win.keyboard.press('Escape');
  await expect(win.getByRole('button', { name: 'Старт', exact: true })).toBeVisible();
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    const b = w.getBounds();
    return { fullScreen: w.isFullScreen(), width: b.width, height: b.height };
  })).toEqual({ fullScreen: false, width: 406, height: startBounds.height });
  await expect(win.getByRole('dialog')).toHaveCount(0);
  await expect(win.getByText(/Сессия завершена/)).toHaveCount(0);
  await app.close();
});

test('keys pressed while leaving are ignored: Escape then D marks nothing', async () => {
  const { app, win, dataDir, lib } = await prepare(60, 3);
  // Выход из полноэкранного режима затягивается, чтобы D пришла, пока сессия закрывается.
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    ipcMain.removeHandler('sketch:window:fullscreen');
    ipcMain.handle('sketch:window:fullscreen', async (_e, on: boolean) => {
      await new Promise((r) => setTimeout(r, 1500));
      BrowserWindow.getAllWindows()[0].setFullScreen(on);
    });
  });
  await win.keyboard.press('Escape');
  await win.keyboard.press('d');
  await win.keyboard.press('ArrowRight');
  await expect(win.getByRole('button', { name: 'Старт', exact: true })).toBeVisible();
  await win.waitForTimeout(500);
  expect(marked(lib)).toHaveLength(0);
  expect(query<{ c: number }>(dataDir, 'select count(*) as c from images where rating = -1')[0].c).toBe(0);
  await app.close();
});

test('progress strip shows remaining time and count', async () => {
  const { app, win } = await prepare(3, 2);
  await expect(time(win)).toHaveText(/^\d+:\d{2}$/);
  await expect(win.locator('.session-count')).toHaveText('0/2');
  await expect(win.locator('.session-count')).toHaveText('1/2', { timeout: 6_000 });
  await expect(time(win)).toHaveText(/^\d+:\d{2}$/);
  await expect(win.getByRole('progressbar', { name: 'Прогресс сессии' })).toHaveAttribute('aria-valuenow', '1');
  await app.close();
});
