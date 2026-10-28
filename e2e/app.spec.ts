import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launch, makeLibrary } from './helpers';

test('connecting a library builds the tree, renames files and ignores GIF', async () => {
  const lib = makeLibrary();
  const { app, win } = await launch(undefined, lib);
  await win.getByRole('button', { name: 'Выбрать папку' }).click();
  const tree = win.getByRole('tree');
  await expect(tree.getByText('Позы')).toBeVisible();
  await expect(tree.getByText('Мужские')).toBeVisible();
  await expect(win.getByRole('status')).toContainText('Новых изображений: 4');
  expect(fs.readdirSync(path.join(lib, 'Позы')).sort()).toEqual(['anim.gif', 'Позы_img_01.png', 'Позы_img_02.png', 'Позы_img_03.png']);
  await app.close();
});

test('presets can be created, copied and deleted', async () => {
  const { app, win } = await launch();
  await win.getByRole('button', { name: 'Пресеты' }).click();
  await win.getByRole('button', { name: 'Новый пресет' }).click();
  await expect(win.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  await win.getByLabel('Название', { exact: true }).fill('Разминка');
  await win.getByRole('button', { name: 'Сохранить' }).click();
  await expect(win.getByRole('button', { name: 'Разминка', exact: true })).toBeVisible();
  await win.getByRole('button', { name: 'Копировать' }).click();
  await expect(win.getByRole('button', { name: 'Разминка (копия)' })).toBeVisible();
  await win.getByRole('button', { name: 'Удалить' }).first().click();
  await expect(win.getByRole('button', { name: 'Разминка', exact: true })).toHaveCount(0);
  await expect(win.getByRole('button', { name: 'Разминка (копия)' })).toBeVisible();
  await app.close();
});

test('the app refuses to start when the data folder is not writable', async () => {
  const file = path.join((await import('./helpers')).tempRoot(), 'plain');
  fs.writeFileSync(file, '');
  const { _electron } = await import('@playwright/test');
  const app = await _electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, SKETCH_DATA_DIR: path.join(file, 'data'), SKETCH_NO_ERROR_DIALOG: '1' } as Record<string, string> });
  const code = await new Promise<number | null>((resolve) => app.process().on('exit', resolve));
  expect(code).toBe(1);
});
