# Таймер набросков — План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Портативное Windows-приложение, которое подключает папку с изображениями и проводит интервальные сессии набросков.

**Architecture:** Вся логика живёт в `src/core/*` (чистый TypeScript + `node:sqlite`, без Electron) и покрыта Vitest. `electron/` даёт окно, IPC и путь данных; `src/renderer` (React) только отображает и вызывает `window.api`.

**Tech Stack:** Electron ^44, React ^18.3, Vite ^5.4, TypeScript ^5.6, Vitest ^2.1, Playwright ^1.56, esbuild ^0.24, @electron/packager, @electron/fuses (как в `Animation_todo_list`).

**Spec:** `docs/superpowers/specs/2026-10-28-sketch-timer-design.md`; продукт: `docs/product.md`.

## Global Constraints

- Только Windows x64 портативный ZIP, без установки; БД `sketch-timer.db` рядом с exe (`PORTABLE_EXECUTABLE_DIR`, в разработке `./data`).
- Форматы: `.jpg .jpeg .png .webp .bmp .avif`, GIF игнорируется (регистр расширения не важен).
- Имя файла: `{родительская_папка}_img_{NN}`, номер от 01, никогда не перезаписывать файлы.
- Вес лайка = 3 (константа `LIKE_WEIGHT`), обычное = 1, дизлайк исключается.
- Просмотр засчитывается только по окончании рабочего интервала; пропуск вперёд не засчитывает.
- Интерфейс на русском, тёмная палитра из `Animation_todo_list` (см. спецификацию, раздел 1); без UI-фреймворков.
- Клавиши: Пробел, ←, →, L, D, Esc.
- Для SQLite только `node:sqlite`; нативных зависимостей нет.

## Review Focus

- Имена папок и файлов с кириллицей, пробелами и регистром (Windows нечувствителен к регистру): переименование не должно перезаписать `A_img_01.jpg` файлом `a_img_01.JPG`.
- Файл-изображение битый или удалён во время сессии: сессия пропускает его, а не падает.
- Выбрана категория без доступных изображений (все дизлайкнуты): понятное сообщение, сессия не стартует.
- Пресет без групп или с `repeats = 0` / `work_sec = 0`: отклоняется валидацией.
- Файл бэкапа новее поддерживаемого формата или повреждён: понятная ошибка, база не меняется.
- Библиотека недоступна (диск отключён): данные не стираются, предлагается выбрать папку.
- Библиотека на 10 000 файлов: сканирование и сверка укладываются в разумное время (тест < 5 с на синтетических данных).

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, vitest.config.ts, playwright.config.ts
scripts/build-electron.mjs, scripts/package-win.mjs
.github/workflows/windows.yml
electron/main.ts, electron/preload.ts, electron/paths.ts
src/shared/api.ts                  # типы IPC (SketchApi)
src/core/db.ts                     # openDb, миграции
src/core/formats.ts                # isSupportedImage
src/core/library.ts                # scanLibrary, syncLibrary, дерево
src/core/rename.ts                 # planRenames, applyRenames
src/core/ratings.ts                # setRating, listByRating, recordView, undoView
src/core/picker.ts                 # buildQueue, LIKE_WEIGHT
src/core/presets.ts                # CRUD пресетов, validatePreset
src/core/timer.ts                  # expandPreset, SessionMachine
src/core/backup.ts                 # exportBackup, importBackup
src/renderer/{index.html,main.tsx,App.tsx,styles.css,store.tsx}
src/renderer/screens/{Library,Rated,Presets,SessionSetup,Session}.tsx
tests/core/*.test.ts, tests/helpers.ts (временные папки и БД в памяти), e2e/*.spec.ts
```

### Task 1: Каркас проекта

**Files:** Create `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `scripts/build-electron.mjs`, `.gitignore`, `tests/core/smoke.test.ts`.

**Interfaces:** Produces scripts `build:renderer`, `build:electron`, `build`, `start`, `test`, `typecheck`, `e2e`, `package:win` (имена как в референсе).

- [ ] **Step 1:** Взять `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `scripts/build-electron.mjs` из `Animation_todo_list` (клон `/home/user/animation_todo_list`), заменив имя на `sketch-timer`, productName `Sketch Timer`; esbuild target `node22`.
- [ ] **Step 2:** Тест `smoke.test.ts`: `import { DatabaseSync } from 'node:sqlite'`; `new DatabaseSync(':memory:').prepare('select 1 as x').get()` равно `{ x: 1 }`.
- [ ] **Step 3:** `npm install`, затем `npm test` — PASS; `npm run typecheck` — без ошибок.
- [ ] **Step 4:** Commit `chore: project scaffold`.

### Task 2: База данных и миграции

**Files:** Create `src/core/db.ts`, `tests/helpers.ts`, `tests/core/db.test.ts`.

**Interfaces:** Produces `openDb(file: string): DatabaseSync` (`':memory:'` разрешён), `SCHEMA_VERSION = 1`. Таблицы по разделу 2 спецификации (`settings, categories, images, views, presets, preset_groups, sessions`), `PRAGMA foreign_keys=ON`, `journal_mode=WAL`.

- [ ] **Step 1:** Тесты: `openDb(':memory:')` создаёт все 7 таблиц; `PRAGMA user_version` равен 1; повторное открытие файла в temp-папке не пересоздаёт данные (вставленная строка `settings` сохраняется); база с `user_version = 99` вызывает `Error` с текстом «слишком новая».
- [ ] **Step 2:** Запустить `npx vitest run tests/core/db.test.ts` — FAIL.
- [ ] **Step 3:** Реализовать `openDb` с массивом миграций `MIGRATIONS: ((db) => void)[]`, применяемых по `user_version`.
- [ ] **Step 4:** Запуск — PASS. Commit `feat(core): sqlite schema and migrations`.

### Task 3: Форматы и библиотека

**Files:** Create `src/core/formats.ts`, `src/core/library.ts`, tests `tests/core/formats.test.ts`, `tests/core/library.test.ts`.

**Interfaces:** Produces `isSupportedImage(name: string): boolean`; `syncLibrary(db, root: string): Promise<SyncResult>` с `SyncResult = { addedImages: number; addedCategories: number; missing: number; restored: number }`; `listTree(db): CategoryNode[]` где `CategoryNode = { id: number; parentId: number|null; name: string; relPath: string; imageCount: number; children: CategoryNode[] }` (imageCount считает только не-missing, не дизлайкнутые изображения категории с подкатегориями).

- [ ] **Step 1:** Тесты formats: `a.JPG`, `b.webp`, `c.avif`, `d.bmp`, `e.png`, `f.jpeg` → true; `g.gif`, `h.GIF`, `i.txt`, `noext` → false.
- [ ] **Step 2:** Тесты library (во временной папке с `Лица/Мужские/a.jpg`, `Позы/b.png`, `Позы/c.gif`, `Позы/readme.txt`): первый `syncLibrary` создаёт категории «Лица», «Позы» (parent null) и «Мужские» (parent «Лица»), добавляет 2 изображения, GIF и txt не попадают; корневые файлы без папки игнорируются; повторный sync ничего не добавляет; новый файл подхватывается; удалённый файл получает `missing=1`, возвращённый снимает; оценка удалённого и вернувшегося файла сохраняется; 10 000 синтетических файлов синхронизируются быстрее 5 с.
- [ ] **Step 3:** Запуск — FAIL. Реализовать рекурсивный обход `fs.promises.readdir({withFileTypes})`, вставки в одной транзакции; ключ изображения — `rel_path` в нижнем регистре не используется, хранится как есть, сравнение при сверке через `rel_path`.
- [ ] **Step 4:** PASS, commit `feat(core): library scan and sync`.

### Task 4: Безопасное переименование

**Files:** Create `src/core/rename.ts`, `tests/core/rename.test.ts`.

**Interfaces:** Produces `planRenames(dir: string, files: string[], existing: string[]): { from: string; to: string }[]` (чистая функция: `dir` — имя родительской папки) и `renameNewImages(db, root: string): Promise<RenameReport>` где `RenameReport = { renamed: number; failed: { path: string; error: string }[] }`; после успешного `rename` обновляет `images.rel_path`/`file_name`.

- [ ] **Step 1:** Тесты planRenames: для папки «Позы» и файлов `x.jpg`, `y.PNG` без существующих → `Позы_img_01.jpg`, `Позы_img_02.PNG`; при существующих `Позы_img_01.jpg`, `Позы_img_05.jpg` новый получает `_06`; файл, уже названный по шаблону этой папки, в план не попадает; сравнение имён регистронезависимое (`позы_IMG_01.JPG` занимает номер 01); после 99 номер трёхзначный `_100`.
- [ ] **Step 2:** Тесты renameNewImages на temp-папке: файлы переименованы, содержимое сохранено побайтно, повторный запуск ничего не меняет (`renamed = 0`); если целевое имя внезапно занято (создать файл между планом и применением) — берётся следующий номер, старый файл цел; ошибка доступа к одному файлу попадает в `failed`, остальные переименовываются.
- [ ] **Step 3:** Реализовать: перед `rename` проверка `lstat` целевого пути, при занятом — следующий номер (цикл); никакого `overwrite`.
- [ ] **Step 4:** PASS, commit `feat(core): safe image renaming`.

### Task 5: Оценки и история просмотров

**Files:** Create `src/core/ratings.ts`, `tests/core/ratings.test.ts`.

**Interfaces:** Produces `type Rating = -1 | 0 | 1`; `setRating(db, imageId: number, rating: Rating): void`; `toggleRating(db, imageId, target: 1 | -1): Rating` (повторное нажатие снимает); `listByRating(db, rating: 1 | -1): ImageRow[]`; `recordView(db, imageId, cycle: number): number` (возвращает id записи); `undoView(db, viewId: number): void`. `ImageRow = { id; categoryId; relPath; fileName; rating: Rating; missing: boolean }`.

- [ ] **Step 1:** Тесты: toggle 1 → 1, повтор → 0; toggle -1 после лайка → -1 (заменяет); `listByRating(1)` не возвращает missing; `recordView` создаёт запись, `undoView` удаляет только её.
- [ ] **Step 2:** FAIL → реализовать → PASS. Commit `feat(core): ratings and view history`.

### Task 6: Выбор изображений

**Files:** Create `src/core/picker.ts`, `tests/core/picker.test.ts`.

**Interfaces:** Consumes `ImageRow` (Task 5). Produces `LIKE_WEIGHT = 3`; `buildQueue(db, categoryIds: number[], count: number, rng?: () => number): QueueItem[]` где `QueueItem = { image: ImageRow; categoryId: number; cycle: number }`; пул включает подкатегории выбранных; цикл категории хранится как `MAX(views.cycle)` с учётом полноты (см. шаг 3).

- [ ] **Step 1:** Тесты с детерминированным `rng`: дизлайкнутые и missing не попадают; внутри очереди нет повторов; уже просмотренные в текущем цикле идут раньше невиданных не попадают, пока есть непросмотренные (из 5 изображений 3 просмотрены, очередь длины 2 состоит ровно из 2 оставшихся); когда все просмотрены, берётся новый цикл (`cycle+1`) со всеми; статистика: при 10 000 итераций с фиксированным seed лайкнутое появляется первым примерно в 3 раза чаще обычного (допуск ±15 %); `count` больше пула → очередь пула, затем начинается новый цикл без повтора внутри одного цикла; пустой пул → бросает `EmptyPoolError`.
- [ ] **Step 2:** FAIL → реализовать: выбор ключом `-ln(u)/w` (эквивалент Эфраимидиса–Спиракиса, сортировка по возрастанию), по категориям. Цикл категории = текущий максимальный `cycle` в `views` её изображений, а если все её доступные изображения просмотрены в нём — `cycle+1`.
- [ ] **Step 3:** PASS, commit `feat(core): weighted queue builder`.

### Task 7: Пресеты

**Files:** Create `src/core/presets.ts`, `tests/core/presets.test.ts`.

**Interfaces:** Produces `type Group = { repeats: number; workLabel: string; workSec: number; restSec: number }`; `type Preset = { id: number; name: string; description: string; groups: Group[] }`; `validatePreset(p: Omit<Preset,'id'>): string[]` (список ошибок на русском); `savePreset(db, p: Omit<Preset,'id'> & { id?: number }): number`, `listPresets(db): Preset[]`, `copyPreset(db, id): number` (имя «… (копия)»), `deletePreset(db, id): void`.

- [ ] **Step 1:** Тесты: пример из product.md (Приготовьтесь 5 с ×1 без отдыха; Быстрые наброски 60 с / отдых 15 ×35; Формы 180 / 15 ×2; Конструкция 300 / 15 ×1) сохраняется и читается без потерь, порядок групп сохраняется; пустое имя, ноль групп, `repeats < 1`, `workSec < 1`, `restSec < 0` дают ошибки; copy создаёт независимую запись; delete удаляет группы каскадом.
- [ ] **Step 2:** FAIL → реализовать → PASS. Commit `feat(core): timer presets`.

### Task 8: Таймер и автомат сессии

**Files:** Create `src/core/timer.ts`, `tests/core/timer.test.ts`.

**Interfaces:** Consumes `Preset`, `QueueItem`. Produces `type Step = { kind: 'work' | 'rest'; label: string; sec: number; workIndex: number | null }`; `expandPreset(p: Preset): Step[]` (после последнего рабочего интервала отдых группы не пропускается; отдых с `restSec=0` не создаётся); `totalWork(steps): number`; `class SessionMachine` с конструктором `(steps: Step[], queue: QueueItem[], hooks: { onViewed(item: QueueItem): void; onUnviewed(item: QueueItem): void })` и методами `tick(elapsedMs: number)`, `pause()`, `resume()`, `next()`, `prev()`, `finish()`, свойствами `state: 'running'|'paused'|'finished'`, `stepIndex`, `remainingMs`, `currentImage`, `progress: { done: number; total: number }`.

- [ ] **Step 1:** Тесты expandPreset на примере из product.md: рабочих шагов 1+35+2+1 = 39, общее число шагов с отдыхом соответствует; `workIndex` идёт 0..38; «Приготовьтесь» не показывает изображение (изображение привязано только к рабочим шагам кроме группы подготовки — подготовка определяется `repeats=1, restSec=0` и первой позиции; для простоты все рабочие шаги получают изображение, в «Приготовьтесь» оно показывается превью следующего — зафиксировать тестом, что `currentImage` у подготовки равно изображению первого рабочего шага).
- [ ] **Step 2:** Тесты SessionMachine: `tick` на длительность рабочего шага вызывает `onViewed` ровно один раз и переходит к отдыху; `pause` останавливает убывание `remainingMs`; `next()` в рабочем шаге не вызывает `onViewed`, перескакивает к следующему рабочему шагу с полным временем, отдых пропускается; `prev()` возвращается к предыдущему изображению, `progress.done` уменьшается на 1, если шаг был засчитан — вызывается `onUnviewed`; `prev()` на первом шаге ничего не делает; после последнего шага `state = 'finished'`; `tick` большого значения за раз проходит несколько шагов корректно.
- [ ] **Step 3:** FAIL → реализовать (чистая логика, без таймеров; renderer вызывает `tick` по `requestAnimationFrame`/интервалу с дельтой по `performance.now`). PASS. Commit `feat(core): interval timer state machine`.

### Task 9: Резервная копия и импорт

**Files:** Create `src/core/backup.ts`, `tests/core/backup.test.ts`.

**Interfaces:** Produces `exportBackup(db, opts: { includeViews: boolean }): BackupFile` (JSON-объект `{ format: 'sketch-timer-backup', version: 1, createdAt, ratings: { relPath, fileName, size, rating }[], presets: Preset[], views?: ... }`) и `importBackup(db, data: unknown): ImportReport` где `ImportReport = { ratingsApplied: number; ratingsUnmatched: string[]; presetsAdded: number }`. Бросает `BackupError` с русским текстом при неверном `format` или `version > 1`.

- [ ] **Step 1:** Тесты: экспорт → импорт в чистую БД с той же структурой библиотеки восстанавливает лайки/дизлайки и пресеты; сопоставление сначала по `relPath`, затем по `size + fileName`; не найденные попадают в `ratingsUnmatched` и не вызывают ошибку; пресет с тем же именем импортируется как «Имя (импорт)»; существующие записи не перезаписываются; `version: 2`, мусорный JSON, отсутствие поля `format` → `BackupError`, БД не изменилась.
- [ ] **Step 2:** FAIL → реализовать в транзакции (откат при ошибке) → PASS. Commit `feat(core): backup export and import`.

### Task 10: Electron-оболочка и IPC

**Files:** Create `electron/paths.ts`, `electron/main.ts`, `electron/preload.ts`, `src/shared/api.ts`, `tests/core/paths.test.ts`.

**Interfaces:** Produces `resolveDataDir(env: NodeJS.ProcessEnv, cwd: string): string` (`PORTABLE_EXECUTABLE_DIR`, иначе `<cwd>/data`), `assertWritable(dir: string): void` (бросает `Error` на русском с путём); `SketchApi` в `src/shared/api.ts` с методами: `connectLibrary()`, `syncLibrary()`, `renameNew()`, `getTree()`, `listRated(rating)`, `setRating(id, r)`, `presets.{list,save,copy,delete}`, `startSession(categoryIds, presetId)`, `recordView(...)`, `undoView(id)`, `exportBackup()`, `importBackup()`, `imageUrl(id)`; изображения отдаются через зарегистрированную схему `sketch://image/<id>` (обработчик проверяет, что путь внутри корня библиотеки).

- [ ] **Step 1:** Тесты paths: `resolveDataDir` с и без `PORTABLE_EXECUTABLE_DIR`; `assertWritable` на временной папке проходит, на несуществующей/read-only бросает ошибку с путём (на Linux через `chmod 555`; пропустить, если запущено от root).
- [ ] **Step 2:** Реализовать main (окно без рамки как в референсе, `contextIsolation: true`, `nodeIntegration: false`, CSP), preload через `contextBridge`, IPC-обработчики поверх `src/core/*`. При старте: `assertWritable` → при ошибке `dialog.showErrorBox` и выход; затем `openDb`, `syncLibrary` и `renameNew` для сохранённой библиотеки (фоново, прогресс в UI).
- [ ] **Step 3:** `npm run typecheck && npm test && npm run build` — без ошибок. Commit `feat: electron shell and ipc`.

### Task 11: Интерфейс: оболочка, библиотека, оценки, пресеты

**Files:** Create `src/renderer/{index.html,main.tsx,App.tsx,styles.css,store.tsx}`, `src/renderer/screens/{Library,Rated,Presets,SessionSetup}.tsx`, `e2e/app.spec.ts`, `playwright.config.ts`.

**Interfaces:** Consumes `SketchApi` (Task 10) через `window.api`.

- [ ] **Step 1:** Скопировать токены `:root` и базовые стили шапки/боковой навигации из `Animation_todo_list/src/renderer/styles.css`; боковое меню: «Библиотека», «Лайки», «Дизлайки», «Пресеты», «Сессия».
- [ ] **Step 2:** Реализовать экраны: Библиотека (кнопки «Выбрать папку», «Обновить», «Переименовать», дерево с чекбоксами категорий и счётчиками, отчёт о переименовании); Лайки/Дизлайки (сетка миниатюр, снять оценку); Пресеты (список, редактор групп: повторы, название упражнения, работа, отдых, копировать/удалить, ошибки валидации); Настройка сессии (выбранные категории, выбор пресета, «Начать», сообщение при пустом пуле).
- [ ] **Step 3:** e2e (Playwright + Electron, временная БД и библиотека из 3 PNG, созданных в тесте): подключить папку → дерево видно; создать пресет → он в списке; скопировать и удалить. Запуск `npm run e2e:linux` — PASS.
- [ ] **Step 4:** Commit `feat(ui): library, rated, presets, session setup`.

### Task 12: Экран сессии

**Files:** Create `src/renderer/screens/Session.tsx`, `e2e/session.spec.ts`.

**Interfaces:** Consumes `SessionMachine` (Task 8), `window.api.recordView/undoView`.

- [ ] **Step 1:** Реализовать полноэкранный вид: изображение `object-fit: contain` по центру, справа сверху таймер (`mm:ss`) и название, ниже кнопки (пауза, назад, вперёд, лайк, дизлайк, завершить), сверху полоса прогресса `done/total`; шаг тика через `performance.now()`; клавиши Пробел, ←, →, L, D, Esc (подтверждение); отдых — затемнение изображения и надпись «Отдых»; битое изображение (`onError`) пропускается без засчёта; экран итога.
- [ ] **Step 2:** e2e: пресет «1 с работа / 0 отдых ×2», три изображения → после 2 секунд сессия завершена, в БД 2 просмотра; `→` не добавляет просмотр; `←` возвращает предыдущее; `L` ставит лайк, повторное снимает; Esc → подтверждение → выход.
- [ ] **Step 3:** `npm run e2e:linux` — PASS. Commit `feat(ui): fullscreen session screen`.

### Task 13: Резервные копии в интерфейсе, упаковка, CI, документация

**Files:** Create `scripts/package-win.mjs`, `.github/workflows/windows.yml`, `README.md`, `docs/ИНСТРУКЦИЯ.md`; Modify `src/renderer/screens/Library.tsx` (кнопки «Резервная копия», «Импорт»).

- [ ] **Step 1:** Подключить `exportBackup`/`importBackup` к диалогам сохранения/открытия файла, показ `ImportReport` (сколько совпало, сколько не найдено).
- [ ] **Step 2:** Адаптировать `scripts/package-win.mjs` и workflow из `Animation_todo_list` (имена `Sketch Timer`, ZIP `Sketch-Timer-<версия>-win32-x64.zip`).
- [ ] **Step 3:** README (запуск, тесты, сборка) и краткая инструкция пользователя на русском.
- [ ] **Step 4:** `npm run typecheck && npm test && npm run e2e:linux` — всё PASS. Commit `feat: backup ui, windows packaging, docs`.

### Task 14: Проверка перед завершением

- [ ] **Step 1:** Использовать `superpowers:verification-before-completion`: вывести полный лог `typecheck`, `test`, `build`, `e2e:linux`; сверить критерии успешного результата из `docs/product.md` один за другим с тестом, который их доказывает; зафиксировать то, что не проверено в Linux (запуск .exe на Windows).
- [ ] **Step 2:** Открыть PR из ветки в `main` с отчётом.

---

Самопроверка по спецификации: форматы (T3), синхронизация (T3), переименование (T4), выбор и веса (T6), таймер и навигация (T8), бэкап (T9), ошибки записи (T10), горячие клавиши и экран (T12), тесты (T1–T9, e2e T11–T12), сборка (T13).
