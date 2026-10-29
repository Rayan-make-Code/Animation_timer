import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launch, makeLibrary, png, query, tempRoot } from './helpers';

test('first run shows three default presets and opens the editor on click', async () => {
  const { app, win } = await launch();
  await expect(win.getByRole('button', { name: /^Разминка/ })).toBeVisible();
  await expect(win.getByRole('button', { name: /^Жесты 20/ })).toBeVisible();
  await expect(win.getByRole('button', { name: /^Длинная/ })).toBeVisible();
  await win.getByRole('button', { name: /^Жесты 20/ }).click();
  await expect(win.getByRole('textbox', { name: 'Название' })).toHaveValue('Жесты 20');
  await app.close();
});

test('connecting a library shows category tags, all off', async () => {
  const lib = makeLibrary();
  const { app, win } = await launch(undefined, lib);
  await win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  await expect(win.getByRole('status')).toContainText('Новых изображений: 4');
  expect(fs.readdirSync(path.join(lib, 'Позы')).sort()).toEqual(['anim.gif', 'Позы_img_01.png', 'Позы_img_02.png', 'Позы_img_03.png']);
  const tags = win.getByRole('group', { name: 'Категории' });
  for (const name of ['Позы', 'Лица', 'Мужские']) await expect(tags.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false');
  const start = win.getByRole('button', { name: 'Старт', exact: true });
  await expect(start).toBeDisabled();
  await tags.getByRole('button', { name: 'Позы', exact: true }).click();
  await expect(tags.getByRole('button', { name: 'Позы', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(start).toBeEnabled();
  await expect(win.getByText('цикл: осталось 3 из 3')).toBeVisible();
  await app.close();
});

test('no library: footer says «Папка не выбрана» and Старт is disabled', async () => {
  const { app, win } = await launch();
  await expect(win.getByText('Папка не выбрана')).toBeVisible();
  const start = win.getByRole('button', { name: 'Старт', exact: true });
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute('data-tip', 'Сначала выберите папку библиотеки');
  await app.close();
});

test('creating a preset in the editor saves it', async () => {
  const { app, win, dataDir } = await launch();
  await win.getByRole('button', { name: 'Новый пресет' }).click();
  await win.getByRole('textbox', { name: 'Название' }).fill('Тест');
  await win.getByRole('button', { name: 'Сохранить' }).click();
  await expect(win.getByRole('button', { name: /^Тест/ })).toBeVisible();
  expect(query<{ name: string }>(dataDir, "select name from presets where name = 'Тест'")).toHaveLength(1);
  await app.close();
});

test('the app refuses to start when the data folder is not writable', async () => {
  const file = path.join(tempRoot(), 'plain');
  fs.writeFileSync(file, '');
  const { _electron } = await import('@playwright/test');
  const app = await _electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, SKETCH_DATA_DIR: path.join(file, 'data'), SKETCH_NO_ERROR_DIALOG: '1' } as Record<string, string> });
  const code = await new Promise<number | null>((resolve) => app.process().on('exit', resolve));
  expect(code).toBe(1);
});

test('an image lying directly in the chosen folder is indexed and renamed after that folder', async () => {
  const root = path.join(tempRoot(), 'image');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'madara_1.png'), png(20, 20, 200));
  const { app, win } = await launch(undefined, root);
  await win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  await expect(win.getByRole('group', { name: 'Категории' }).getByRole('button', { name: 'image', exact: true })).toBeVisible();
  expect(fs.readdirSync(root)).toEqual(['image_img_01.png']);
  await app.close();
});
