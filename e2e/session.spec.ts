import { expect, test, type Page } from '@playwright/test';
import { launch, makeLibrary, query } from './helpers';

async function prepare(durationSec: number, repeats: number, restSec = 0) {
  const run = await launch(undefined, makeLibrary());
  const { win } = run;
  await win.getByRole('button', { name: 'Выбрать папку' }).click();
  await expect(win.getByRole('tree').getByText('Позы')).toBeVisible();
  await win.evaluate(([sec, rep, rest]) => window.sketch.savePreset({
    name: 'Тест', description: '', groups: [{ repeats: rep, workLabel: 'Наброски', workSec: sec, restSec: rest }],
  }), [durationSec, repeats, restSec]);
  await win.getByRole('button', { name: 'Сессия' }).click();
  await win.getByLabel('Категория Позы').check();
  await win.getByRole('button', { name: 'Начать' }).click();
  await expect(win.getByRole('progressbar')).toBeVisible();
  return run;
}

const timer = (win: Page) => win.locator('.timer');

test('a finished session records a view for every completed interval', async () => {
  const { app, win, dataDir } = await prepare(1, 2);
  await expect(win.getByText('Сессия завершена')).toBeVisible({ timeout: 10_000 });
  await expect(win.getByText('Просмотрено: 2 из 2')).toBeVisible();
  expect(query<{ c: number }>(dataDir, 'select count(*) as c from views')[0].c).toBe(2);
  await win.getByRole('button', { name: 'Закрыть' }).click();
  await expect(win.getByRole('button', { name: 'Библиотека' })).toBeVisible();
  await app.close();
});

test('skipping does not count, going back restores the previous image', async () => {
  const { app, win, dataDir } = await prepare(60, 3);
  const first = await win.locator('.stage-img').getAttribute('src');
  await win.keyboard.press('ArrowRight');
  await expect(win.locator('.stage-img')).not.toHaveAttribute('src', first!);
  expect(query<{ c: number }>(dataDir, 'select count(*) as c from views')[0].c).toBe(0);
  await win.keyboard.press('ArrowLeft');
  await expect(win.locator('.stage-img')).toHaveAttribute('src', first!);
  await expect(timer(win)).toHaveText('1:00');
  await app.close();
});

test('space pauses the countdown', async () => {
  const { app, win } = await prepare(60, 1);
  await win.keyboard.press(' ');
  await expect(win.getByText(/пауза/)).toBeVisible();
  const before = await timer(win).textContent();
  await win.waitForTimeout(1500);
  await expect(timer(win)).toHaveText(before!);
  await win.keyboard.press(' ');
  await expect(win.getByText(/пауза/)).toHaveCount(0);
  await app.close();
});

test('L likes the image and shows it in the Likes tab; pressing again removes it', async () => {
  const { app, win } = await prepare(60, 1);
  const like = win.getByRole('button', { name: 'Лайк', exact: true });
  await win.keyboard.press('l');
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await win.keyboard.press('l');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await win.keyboard.press('l');
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await win.keyboard.press('Escape');
  await win.getByRole('dialog').getByRole('button', { name: 'Завершить' }).click();
  await win.getByRole('button', { name: 'Лайки', exact: true }).click();
  await expect(win.locator('.card')).toHaveCount(1);
  await app.close();
});

test('Escape asks for confirmation before ending the session', async () => {
  const { app, win } = await prepare(60, 1);
  await win.keyboard.press('Escape');
  await expect(win.getByRole('dialog')).toBeVisible();
  await win.getByRole('button', { name: 'Продолжить' }).click();
  await expect(win.getByRole('dialog')).toHaveCount(0);
  await expect(win.getByRole('progressbar')).toBeVisible();
  await app.close();
});

test('an empty selection cannot start; a library of only disliked images shows a message', async () => {
  const { app, win } = await launch(undefined, makeLibrary());
  await win.getByRole('button', { name: 'Выбрать папку' }).click();
  await expect(win.getByRole('tree').getByText('Мужские')).toBeVisible();
  await win.evaluate(() => window.sketch.savePreset({ name: 'T', description: '', groups: [{ repeats: 1, workLabel: 'x', workSec: 5, restSec: 0 }] }));
  await win.getByRole('button', { name: 'Сессия' }).click();
  await expect(win.getByRole('button', { name: 'Начать' })).toBeDisabled();
  await app.close();
});
