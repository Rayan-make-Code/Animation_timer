import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { choosePresetCategory, launch, makeLibrary, png, query, tempRoot } from './helpers';

test('first run shows the 1 h default preset and opens the editor on click', async () => {
  const { app, win } = await launch();
  await expect(win.getByRole('button', { name: /^1 ч/ })).toBeVisible();
  await expect(win.getByRole('button', { name: /^Разминка/ })).toHaveCount(0);
  await win.getByRole('button', { name: /^1 ч/ }).click();
  await expect(win.getByRole('textbox', { name: 'Название' })).toHaveValue('1 ч');
  await app.close();
});

test('during the first run the library panel is open by default', async () => {
  const { app, win } = await launch();
  await expect(win.getByRole('toolbar', { name: 'Библиотека' })).toBeVisible();
  await app.close();
});

test('after the first session start the footer is collapsed and a preset click shows the editor, then the dial', async () => {
  const first = await launch(undefined, makeLibrary());
  await first.win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  // Категории принадлежат пресету: выбираем их в редакторе «1 ч».
  await choosePresetCategory(first.win, /^1 ч/, 'Позы');
  await first.win.getByRole('button', { name: 'Старт', exact: true }).click();
  await expect(first.win.getByRole('progressbar', { name: 'Прогресс сессии' })).toBeVisible();
  await expect.poll(() => query<{ value: string }>(first.dataDir, "select value from settings where key = 'firstRunDone'")[0]?.value).toBe('1');
  await first.win.keyboard.press('Escape');
  await expect(first.win.getByRole('button', { name: 'Старт', exact: true })).toBeVisible();
  await first.app.close();

  const { app, win } = await launch(first.dataDir);
  await expect(win.getByRole('button', { name: /^1 ч/ })).toBeVisible();
  // Подвал свёрнут до шестерёнки: ни панели, ни пути к папке.
  await expect(win.getByRole('toolbar', { name: 'Библиотека' })).toHaveCount(0);
  await expect(win.getByRole('button', { name: 'Сменить папку библиотеки' })).toHaveCount(0);
  await win.getByRole('button', { name: 'Меню библиотеки' }).click();
  await expect(win.getByRole('button', { name: 'Сменить папку библиотеки' })).toBeVisible();
  // Выбор пресета сразу открывает редактор; стрелка «назад» сохраняет и показывает циферблат.
  await win.getByRole('button', { name: /^1 ч/ }).click();
  await expect(win.getByRole('textbox', { name: 'Название' })).toHaveValue('1 ч');
  await win.getByRole('button', { name: 'Назад к циферблату' }).click();
  await expect(win.getByRole('region', { name: 'Циферблат пресета' })).toBeVisible();
  await expect(win.getByRole('textbox', { name: 'Название' })).toHaveCount(0);
  await app.close();
});

test('editing autosaves when the user moves to the next field, and preparation has no repeats', async () => {
  const { app, win, dataDir } = await launch(undefined, makeLibrary());
  await win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  await win.getByRole('button', { name: /^1 ч/ }).click();
  await expect(win.getByRole('textbox', { name: 'Этап 1: повторы' })).toHaveCount(0);
  await expect(win.getByRole('textbox', { name: 'Этап 1: упражнение' })).toHaveValue('Приготовьтесь');
  await win.getByRole('textbox', { name: 'Название' }).fill('Час 2');
  // Переход в следующее поле сохраняет название, кнопок «Сохранить» и «Отмена» нет.
  await win.getByRole('textbox', { name: 'Описание' }).focus();
  await expect.poll(() => query<{ name: string }>(dataDir, "select name from presets where name = 'Час 2'")).toHaveLength(1);
  await expect(win.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0);
  await expect(win.getByRole('button', { name: 'Отмена', exact: true })).toHaveCount(0);
  await app.close();
});

test('clicking a category in the editor keeps the editor open; the back arrow saves and shows the dial', async () => {
  const { app, win, dataDir } = await launch(undefined, makeLibrary());
  await win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  await win.getByRole('button', { name: /^1 ч/ }).click();
  const cats = win.getByRole('group', { name: 'Категории пресета' });
  await cats.getByRole('button', { name: 'Позы', exact: true }).click();
  await cats.getByRole('button', { name: 'Лица', exact: true }).click();
  await expect(cats.getByRole('button', { name: 'Позы', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(win.getByRole('textbox', { name: 'Название' })).toBeVisible();
  await win.getByRole('button', { name: 'Назад к циферблату' }).click();
  await expect(win.getByRole('region', { name: 'Циферблат пресета' })).toBeVisible();
  await expect.poll(() => JSON.parse(query<{ c: string }>(dataDir, "select category_ids as c from presets where name = '1 ч'")[0].c).length).toBe(2);
  await app.close();
});

test('connecting a library makes every folder a category, all off, and Старт waits for one', async () => {
  const lib = makeLibrary();
  const { app, win } = await launch(undefined, lib);
  await win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  await expect(win.getByRole('status')).toHaveText(/Библиотека: новых 4, переименовано 4/);
  expect(fs.readdirSync(path.join(lib, 'Позы')).sort()).toEqual(['anim.gif', 'Позы_img_01.png', 'Позы_img_02.png', 'Позы_img_03.png']);
  const start = win.getByRole('button', { name: 'Старт', exact: true });
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute('data-tip', 'Выберите категории для пресета или отдельного этапа');
  await win.getByRole('button', { name: /^1 ч/ }).click();
  const cats = win.getByRole('group', { name: 'Категории пресета' });
  for (const name of ['Позы', 'Лица', 'Мужские']) await expect(cats.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await win.getByRole('button', { name: 'Назад к циферблату' }).click();
  await choosePresetCategory(win, /^1 ч/, 'Позы');
  await expect(start).toBeEnabled();
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

test('creating a preset in the editor saves it when the next field is filled', async () => {
  const { app, win, dataDir } = await launch();
  await win.getByRole('button', { name: 'Новый пресет' }).click();
  await win.getByRole('textbox', { name: 'Название' }).fill('Тест');
  await win.getByRole('textbox', { name: 'Описание' }).focus();
  await expect.poll(() => query<{ name: string }>(dataDir, "select name from presets where name = 'Тест'")).toHaveLength(1);
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
  await expect.poll(() => fs.readdirSync(root)).toEqual(['image_img_01.png']);
  await win.getByRole('button', { name: /^1 ч/ }).click();
  await expect(win.getByRole('group', { name: 'Категории пресета' }).getByRole('button', { name: 'image', exact: true })).toBeVisible();
  await app.close();
});

test('a preset whose categories have no images left cannot start, with a message', async () => {
  const lib = makeLibrary();
  const first = await launch(undefined, lib);
  await first.win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  await choosePresetCategory(first.win, /^1 ч/, 'Позы');
  await first.app.close();

  // Все изображения «Позы» пропали с диска.
  query(first.dataDir, "update images set missing = 1 where rel_path like 'Позы/%'");
  const { app, win } = await launch(first.dataDir);
  const start = win.getByRole('button', { name: 'Старт', exact: true });
  await expect(start).toBeDisabled();
  await expect(start).toHaveAttribute('data-tip', 'В выбранных категориях нет изображений');
  await app.close();
});

test('the editor hides the start buttons; the back arrow brings them back', async () => {
  const { app, win } = await launch(undefined, makeLibrary());
  await win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  await expect(win.getByRole('button', { name: 'Старт', exact: true })).toBeVisible();
  await win.getByRole('button', { name: /^1 ч/ }).click();
  await expect(win.getByRole('button', { name: 'Старт', exact: true })).toHaveCount(0);
  await expect(win.getByRole('button', { name: 'Редактировать пресет' })).toHaveCount(0);
  await win.getByRole('button', { name: 'Назад к циферблату' }).click();
  await expect(win.getByRole('button', { name: 'Старт', exact: true })).toBeVisible();
  await app.close();
});

test('the interval list shows at most three intervals and scrolls the rest', async () => {
  const { app, win } = await launch();
  await win.getByRole('button', { name: /^1 ч/ }).click();
  for (let i = 0; i < 4; i++) await win.getByRole('button', { name: 'Добавить этап' }).click();
  const size = await win.locator('.ed-groups').evaluate((el) => {
    const rows = [...el.querySelectorAll<HTMLElement>('.ed-row')];
    return { rows: rows.length, client: el.clientHeight, three: rows.slice(0, 3).reduce((h, r) => h + r.offsetHeight, 0), scroll: el.scrollHeight };
  });
  expect(size.rows).toBe(6);
  expect(size.client).toBe(size.three);
  expect(size.scroll).toBeGreaterThan(size.client);
  await app.close();
});

test('seconds typed as digits turn into m:ss when the field is left', async () => {
  const { app, win } = await launch();
  await win.getByRole('button', { name: /^1 ч/ }).click();
  const work = win.getByRole('textbox', { name: 'Этап 2: работа' });
  await work.fill('90');
  await win.getByRole('textbox', { name: 'Описание' }).focus();
  await expect(work).toHaveValue('1:30');
  await app.close();
});

test('entering a time field clears it, typing replaces the old value, leaving it empty restores it', async () => {
  const { app, win } = await launch();
  await win.getByRole('button', { name: /^1 ч/ }).click();
  const work = win.getByRole('textbox', { name: 'Этап 2: работа' });
  await expect(work).toHaveValue('1:00');
  await work.click();
  await expect(work).toHaveValue('');
  await expect(work).toHaveAttribute('placeholder', '1:00');
  await win.keyboard.type('45');
  await win.getByRole('textbox', { name: 'Описание' }).focus();
  await expect(work).toHaveValue('0:45');
  await work.click();
  await win.getByRole('textbox', { name: 'Описание' }).focus();
  await expect(work).toHaveValue('0:45');
  await app.close();
});

test('the default window fits the editor with three intervals without scrolling the screen', async () => {
  const { app, win } = await launch(undefined, makeLibrary());
  await win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  await expect(win.getByRole('status')).toContainText('Библиотека:');
  await win.getByRole('button', { name: /^1 ч/ }).click();
  for (let i = 0; i < 4; i++) await win.getByRole('button', { name: 'Добавить этап' }).click();
  const main = win.locator('.main');
  await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);
  await app.close();
});

test('Обновить moves files marked _del into trash', async () => {
  const lib = makeLibrary();
  const { app, win, dataDir } = await launch(undefined, lib);
  await win.getByRole('button', { name: 'Выбрать папку библиотеки' }).click();
  await expect(win.getByRole('button', { name: 'Обновить', exact: true })).toBeEnabled();
  fs.writeFileSync(path.join(lib, 'Позы', 'old_del.png'), png(10, 10, 10));
  await win.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(win.getByText(/в trash 1/)).toBeVisible();
  expect(fs.readdirSync(path.join(lib, 'trash'))).toEqual(['old_del.png']);
  expect(fs.existsSync(path.join(lib, 'Позы', 'old_del.png'))).toBe(false);
  expect(query<{ c: number }>(dataDir, "select count(*) as c from images where file_name like '%\\_del%' escape '\\' and missing = 0")[0].c).toBe(0);
  await app.close();
});
