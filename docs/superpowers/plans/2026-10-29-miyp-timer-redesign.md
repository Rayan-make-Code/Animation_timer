# MIYP Timer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tabbed UI with the approved one-screen MIYP Timer interface (preset clocks, dial, tag categories, compact session), add dislike-to-Recycle-Bin, interval sound and the MIYP Timer name/icon.

**Architecture:** New pure logic goes into `src/core` with Vitest tests (dial ticks, formatting, cycle status, trash, defaults, settings, editor ops). Main process gets a few new IPC channels. The renderer is rebuilt as one `Main` screen made of small components plus a restyled `Session` screen; old screens are deleted.

**Tech Stack:** Electron 44, React 18, Vite 5, TypeScript, node:sqlite, Vitest 2, Playwright (Electron), `@fontsource/exo-2`.

**Spec:** `docs/superpowers/specs/2026-10-29-miyp-timer-redesign-design.md` (base: `2026-10-28-sketch-timer-design.md`).

## Global Constraints

- Product name `MIYP Timer`, package `name` `miyp-timer`, version `0.2.0`, exe `MIYP Timer.exe`, ZIP `MIYP-Timer-<version>-win32-x64.zip`.
- Keep `data/sketch-timer.db`, protocol `sketch-image://`, backup format `sketch-timer-backup`.
- Main window width exactly 406 px (min = max = 406), height 760, min height 560.
- Palette: bg `#141519`, header `#1a1b20`, lines `#2a2b32`, work `#7cc4ff`, rest `#7fd39b`, prepare `#b9bbc6`, subcategory tag `#aab6ff`, dislike `#ff8f8f`, like `#7fd39b`. Radius 6–8 px, no pill buttons.
- UI font `'Segoe UI Variable Text', 'Segoe UI', system-ui` weight 300; timer digits `'Exo 2'` weight 200 bundled via `@fontsource/exo-2` (no network: CSP stays strict).
- All UI text Russian; every icon button has `aria-label` and `data-tip`.
- `SKETCH_*` env vars are read only when `!app.isPackaged`.
- Commits end with the session attribution lines (Co-Authored-By / Claude-Session).

## Review Focus

- Library folder unplugged or not chosen: Start disabled with a reason, footer shows the path or «Папка не выбрана», no crash (Task 7 e2e «no library»).
- Recycle Bin move fails (file locked/already gone): file record untouched, notice shown, session continues (Task 4 test `keeps the record when trash fails`).
- Image id whose path escapes the library (`..` in rel_path): `trashImage` refuses (Task 4 test `refuses paths outside the library`).
- Saved `selectedCategories` refer to categories deleted from disk: ignored on load, Start reflects only existing ones (Task 2 test `parses stale category ids`; Task 7 filters by tree).
- Very long preset (e.g. 3 h with 1-second rests): dial still has exactly 60 ticks and total formatting stays `3 ч` (Task 1 tests).

---

### Task 1: Dial ticks and time formatting

**Files:**
- Create: `src/core/dial.ts`
- Test: `tests/core/dial.test.ts`

**Interfaces:**
- Consumes: `Step` from `src/core/timer.ts`.
- Produces: `type Phase = Step['kind']`; `interface Tick { deg: number; phase: Phase; long: boolean }`; `dialTicks(steps: Step[], n = 60): Tick[]`; `totalSec(steps: Step[]): number`; `formatTotal(sec: number): string`; `formatClock(sec: number): string`; `mmss(sec: number): string` (moved from `components.tsx`).

- [ ] **Step 1: Write failing tests**

```ts
const steps = expandPreset({ name: 'x', description: '', groups: [
  { repeats: 1, workLabel: 'Приготовьтесь', workSec: 5, restSec: 0 },
  { repeats: 2, workLabel: 'Наброски', workSec: 60, restSec: 15 } ] });
test('returns n ticks spaced 360/n degrees starting at half a step', () => {
  const t = dialTicks(steps, 60);
  expect(t).toHaveLength(60);
  expect(t[0].deg).toBeCloseTo(3); expect(t[59].deg).toBeCloseTo(357);
});
test('colours a tick by the phase at its midpoint', () => {
  const t = dialTicks(steps, 60);           // total 155 s → slot ≈ 2.58 s
  expect(t[0].phase).toBe('prepare'); expect(t[3].phase).toBe('work');
  expect(t[59].phase).toBe('rest');
});
test('marks a tick long when a rest starts inside its slot', () => {
  const t = dialTicks(steps, 60);
  expect(t.filter((x) => x.long)).toHaveLength(2);
  expect(t.filter((x) => x.long).every((x) => x.phase === 'rest' || x.phase === 'work')).toBe(true);
});
test('keeps 60 ticks for a 3 h preset with 1 s rests', () => {
  const long = expandPreset({ name: 'l', description: '', groups: [{ repeats: 540, workLabel: 'w', workSec: 19, restSec: 1 }] });
  expect(dialTicks(long)).toHaveLength(60);
  expect(formatTotal(totalSec(long))).toBe('3 ч');
});
test('formats totals', () => {
  expect(formatTotal(35 * 60)).toBe('35 мин'); expect(formatTotal(80 * 60)).toBe('1 ч 20 мин');
  expect(formatTotal(30)).toBe('1 мин');     // rounds up, never «0 мин»
  expect(formatClock(2235)).toBe('37m 15s'); expect(formatClock(3725)).toBe('1h 2m 05s');
  expect(mmss(65)).toBe('1:05');
});
```

- [ ] **Step 2: Run** `npx vitest run tests/core/dial.test.ts` — FAIL (module not found).
- [ ] **Step 3: Implement** in `src/core/dial.ts`. Slot i spans `[i, i+1)·total/n`; phase = step covering `(i+0.5)·total/n`; `long` = some rest step's start time lies in the slot. `formatTotal`: minutes rounded up (`Math.max(1, ceil)`), then `H ч M мин` / `H ч` / `M мин`. `formatClock`: `[Hh ]Mm SSs`. Replace `mmss` in `components.tsx` with a re-export.
- [ ] **Step 4: Run** `npx vitest run tests/core/dial.test.ts` — PASS; `npm run typecheck` clean.
- [ ] **Step 5: Commit** `feat(core): dial ticks and time formatting`.

### Task 2: Settings and default presets

**Files:**
- Create: `src/core/settings.ts`, `src/core/defaults.ts`
- Test: `tests/core/settings.test.ts`, `tests/core/defaults.test.ts`

**Interfaces:**
- Produces: `getSetting(db, key: string): string | null`; `setSetting(db, key: string, value: string): void`; `parseIds(raw: string | null): number[]` (invalid JSON or non-integers → `[]`); `DEFAULT_PRESETS: NewPreset[]`; `seedDefaultPresets(db): boolean` (true when it created them).

- [ ] **Step 1: Failing tests**
  - `setSetting then getSetting returns the value; overwrite replaces it; unknown key → null`.
  - `parses stale category ids`: `parseIds('[1,"x",2.5,3]')` → `[1, 3]`; `parseIds('oops')` → `[]`; `parseIds(null)` → `[]`.
  - `seeds three presets once`: on empty db returns `true`, `listPresets` names `['Разминка','Жесты 20','Длинная']`; second call returns `false` and count stays 3; with one user preset present returns `false`.
  - `Разминка` groups equal `[{1,'Приготовьтесь',5,0},{35,'Быстрые наброски',60,15},{2,'Формы',180,15},{1,'Конструкция',300,15}]`; `Жесты 20` = `[{30,'Жест',30,10}]`, description `короткие жесты на разогрев`; `Длинная` = `[{10,'Позы',120,20},{3,'Проработка',900,60}]`.
- [ ] **Step 2: Run** `npx vitest run tests/core/settings.test.ts tests/core/defaults.test.ts` — FAIL.
- [ ] **Step 3: Implement** with the `settings` table (`insert … on conflict(key) do update`); seeding uses `savePreset` inside `transaction`. Switch `electron/main.ts` library get/set to these helpers.
- [ ] **Step 4: Run** the two files — PASS.
- [ ] **Step 5: Commit** `feat(core): settings helpers and default presets`.

### Task 3: Cycle status

**Files:**
- Modify: `src/core/picker.ts`
- Test: `tests/core/picker.test.ts`

**Interfaces:**
- Produces: `cycleStatus(db, categoryIds: number[]): { remaining: number; total: number }`. Empty selection → `{0,0}`.

- [ ] **Step 1: Failing tests** (reuse existing picker fixtures): fresh library of 3+1 images selecting the parent → `{ remaining: 4, total: 4 }`; after `recordView` on 1 image → `{3, 4}`; after viewing all images of a category its remaining resets to the full count; disliked (`rating=-1`) and `missing=1` images excluded from both numbers; `[]` → `{0,0}`.
- [ ] **Step 2: Run** `npx vitest run tests/core/picker.test.ts` — new tests FAIL.
- [ ] **Step 3: Implement** by extracting the eligible/maxCycle/pending computation of `buildQueue` into a private `firstRound(db, categoryIds)` used by both, so the rules cannot drift.
- [ ] **Step 4: Run** — all picker tests PASS.
- [ ] **Step 5: Commit** `feat(core): cycle status for selected categories`.

### Task 4: Trash on dislike and step-end signal

**Files:**
- Create: `src/core/trash.ts`
- Modify: `src/core/timer.ts`
- Test: `tests/core/trash.test.ts`, `tests/core/timer.test.ts`

**Interfaces:**
- Produces: `type TrashFn = (absPath: string) => Promise<void>`; `trashImage(db, root: string, imageId: number, trash: TrashFn): Promise<void>` (throws `Error` with Russian text on failure); `SessionMachine.tick(elapsedMs): number` — number of steps that ended by time during this call (0 when none).

- [ ] **Step 1: Failing tests**
  - `moves the file and marks the image missing`: fake trash moves file into a temp «bin»; afterwards file gone from library, `missing = 1`, `buildQueue` no longer returns it, `cycleStatus.total` decreased by 1.
  - `keeps the record when trash fails`: trash rejects → `trashImage` rejects with message containing `Не удалось переместить в корзину`, `missing` stays 0, file still exists.
  - `refuses paths outside the library`: image row with `rel_path = '../x.png'` → rejects, trash not called.
  - `unknown image id rejects`.
  - timer: `tick returns how many steps ended`: steps 5 s prepare + 60 s work; `tick(4000)` → 0, `tick(2000)` → 1, `tick(200000)` → 1 (finishes); `next()`/`prev()` do not change the count of subsequent ticks.
- [ ] **Step 2: Run** `npx vitest run tests/core/trash.test.ts tests/core/timer.test.ts` — FAIL.
- [ ] **Step 3: Implement** `trashImage`: resolve `path.resolve(root, ...relPath.split('/'))`, require it to start with `path.resolve(root) + path.sep`, `await trash(abs)`, then `update images set missing = 1 where id = ?`. `tick` counts `completeStep` calls.
- [ ] **Step 4: Run** — PASS, plus full `npm test`.
- [ ] **Step 5: Commit** `feat(core): dislike moves image to recycle bin; tick reports finished steps`.

### Task 5: Preset editor operations

**Files:**
- Create: `src/core/presetEdit.ts`
- Test: `tests/core/presetEdit.test.ts`

**Interfaces:**
- Produces (all pure, return new arrays): `addGroup(groups: Group[]): Group[]` (appends `{repeats: 5, workLabel: 'Наброски', workSec: 60, restSec: 10}`); `duplicateGroup(groups, i): Group[]` (copy inserted at i+1); `moveGroupUp(groups, i): Group[]` (i=0 unchanged); `removeGroup(groups, i): Group[]`; `parseMmss(text: string): number | null` (`'1:05'`→65, `'90'`→90, `'0:00'`→0, `'x'`/`'1:75'`→null).

- [ ] **Step 1: Failing tests** for each function including out-of-range index (returns input unchanged) and immutability (`expect(input).toEqual(copyBefore)`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(core): preset editor list operations`.

### Task 6: Main process, API and window

**Files:**
- Modify: `electron/main.ts`, `electron/preload.ts`, `src/shared/api.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces on `window.sketch`: `getSettings(): Promise<{ selectedPreset: number | null; selectedCategories: number[]; firstRunDone: boolean }>`; `saveSettings(p: Partial<that>): Promise<void>`; `cycleStatus(ids: number[]): Promise<{ remaining: number; total: number }>`; `trashImage(imageId: number): Promise<void>`. `AppState` unchanged. Removed: `listRated`, `renameNew` stays (footer «Переименовать»).

- [ ] **Step 1:** `APP_NAME = 'MIYP Timer'`; window `width: 406, minWidth: 406, maxWidth: 406, height: 760, minHeight: 560`; on leaving fullscreen restore 406 × previous height. Call `seedDefaultPresets(db)` after `openDb`. `library:connect` passes `defaultPath: libraryRoot() ?? undefined`. Backup default name `miyp-timer-<date>.sketchbackup.json`.
- [ ] **Step 2:** `session:trash` handler: `trash = devEnv.SKETCH_FAKE_TRASH ? (p) => fs.promises.rename(p, path.join(devEnv.SKETCH_FAKE_TRASH, path.basename(p))) : (p) => shell.trashItem(p)`; calls `trashImage(db, requireRoot(), id, trash)`.
- [ ] **Step 3:** settings channels store `selectedPreset`, `selectedCategories` (JSON), `firstRunDone` (`'1'`) via Task 2 helpers.
- [ ] **Step 4: Verify** `npm run typecheck && npm test && npm run build` — all clean (renderer still compiles because old screens use only kept methods; delete `listRated` callers in Task 7).
- [ ] **Step 5: Commit** `feat(main): settings, cycle status, trash IPC; 406 px window`.

### Task 7: Main screen and preset editor

**Files:**
- Create: `src/renderer/screens/Main.tsx`, `src/renderer/main/PresetRow.tsx`, `Dial.tsx`, `PresetEditor.tsx`, `CategoryTags.tsx`, `StartBar.tsx`, `Footer.tsx`, `src/renderer/assets/icon.png` (from the approved black figure), `src/renderer/fonts.ts` (imports `@fontsource/exo-2/200.css` and `300.css`)
- Modify: `src/renderer/App.tsx`, `store.tsx`, `styles.css`, `components.tsx`, `index.html` (title, CSP allows `font-src 'self' data:`)
- Delete: `src/renderer/screens/Library.tsx`, `Rated.tsx`, `Presets.tsx`, `SessionSetup.tsx`
- Test: `e2e/app.spec.ts`, `e2e/helpers.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 5, 6.
- Produces: `store` exposes `presets`, `selectedPresetId`, `selected` (category ids), `toggleCategory`, `session`, `setSession`, `notice`, `setNotice`, `firstRun`, `finishedSummary: string | null`. `Tab` removed.

Layout and copy follow spec §3 exactly (order: PresetRow → Dial or PresetEditor → description → CategoryTags → StartBar → Footer). Editor rows use class `rise` with `style={{ animationDelay: 0.04 + 0.08 * i + 's' }}`; `@media (prefers-reduced-motion: reduce)` disables it. Category tags come from flattening `getTree()`; tags with `imageCount === 0` are hidden; stale saved ids are dropped by intersecting with the tree.

- [ ] **Step 1: Rewrite e2e first** (`launch` waits for `.app`; root class stays `app`):
  - `first run shows three default presets and opens the editor on click` — three buttons with aria-labels starting `Разминка`, `Жесты 20`, `Длинная`; click `Жесты 20` → textbox «Название» has value `Жесты 20`.
  - `connecting a library shows category tags, all off` (keep rename/GIF assertions from the old test) — tags `Позы`, `Лица`, `Мужские`, all `aria-pressed=false`; `Старт` disabled; click `Позы` → pressed, `Старт` enabled, text `цикл: осталось 3 из 3`.
  - `no library: footer says «Папка не выбрана» and Старт is disabled`.
  - `creating a preset in the editor saves it` — «Новый пресет», fill name `Тест`, Сохранить → preset button `Тест` exists, row in `presets` table.
  - keep `refuses to start when data folder is not writable` and `root-level image` tests, adapted to tags.
- [ ] **Step 2: Run** `npm run e2e:linux -- e2e/app.spec.ts` — FAIL.
- [ ] **Step 3: Implement** the components; `npm i -D @fontsource/exo-2`.
- [ ] **Step 4: Run** `npm run typecheck && npm test && npm run e2e:linux -- e2e/app.spec.ts` — PASS.
- [ ] **Step 5: Commit** `feat(ui): one-screen main view with preset clocks, dial, tags and editor`.

### Task 8: Session screen, sound and dislike

**Files:**
- Modify: `src/renderer/screens/Session.tsx`, `styles.css`
- Create: `src/renderer/sound.ts`, `src/renderer/icons.tsx` (back, pause, play, forward, heart, urn, exit SVGs from the Session board)
- Test: `e2e/session.spec.ts`

**Interfaces:**
- Consumes: `tick(): number` (Task 4), `window.sketch.trashImage` (Task 6), `formatClock`/`mmss` (Task 1).
- Produces: `playChime(): void` (lazy single `AudioContext`, sine 880 Hz, gain 0.15 → 0.0001 exponential over 150 ms; errors swallowed).

- [ ] **Step 1: Rewrite e2e first** (launch with `SKETCH_FAKE_TRASH` pointing at a temp folder; add an `env` parameter to `launch`):
  - `a finished session records a view for every completed interval` (kept).
  - `skipping does not count, going back restores the previous image` (kept, buttons by aria-label `Следующее изображение` / `Предыдущее изображение`).
  - `space pauses the countdown` (kept).
  - `L likes and pressing again removes the like` — check `rating` in db.
  - `D moves the file to the recycle bin and shows the next image` — file appears in fake bin, missing=1, `img` src changes.
  - `Escape leaves immediately and returns to the main screen` — `Старт` visible, no dialog.
  - `progress strip shows remaining time and count` — text matches `/^\d+:\d{2}$/` and `1/2`.
- [ ] **Step 2: Run** `npm run e2e:linux -- e2e/session.spec.ts` — FAIL.
- [ ] **Step 3: Implement** per spec §4: top 3 px bar, centre strip, bottom-right toolbar; `if (m.tick(dt) > 0) playChime()`; dislike calls `trashImage` then `m.next()`, on error `setNotice`. On finish or exit: `setFullscreen(false)`, `setSession(null)`, set `finishedSummary` to `Сессия завершена: N рис.` only on natural finish. First start writes `firstRunDone`.
- [ ] **Step 4: Run** `npm run typecheck && npm test && npm run e2e:linux` — all PASS.
- [ ] **Step 5: Commit** `feat(ui): compact session screen, interval chime, dislike to recycle bin`.

### Task 9: Rename, icon, docs and packaging

**Files:**
- Modify: `package.json`, `scripts/package-win.mjs`, `README.md`, `docs/ИНСТРУКЦИЯ.md`, `.github/workflows/windows.yml` (artifact name)
- Create: `build/icon.ico` (from `/mnt/project-files/miyp-timer/icon/icon.ico`)

- [ ] **Step 1:** package.json `name: miyp-timer`, `productName: MIYP Timer`, `version: 0.2.0`, description `MIYP Timer — таймер набросков для аниматора`.
- [ ] **Step 2:** packager `name: 'MIYP-Timer'`, `executableName: 'MIYP Timer'`, `icon: path.join(root, 'build', 'icon.ico')`; fuses path `MIYP Timer.exe`; `version.txt` `MIYP Timer <ver>`; ZIP `MIYP-Timer-<ver>-win32-x64.zip`. On non-Windows without `wine`, skip `icon` with a console warning (rcedit needs wine) so local Linux builds still work.
- [ ] **Step 3:** README and ИНСТРУКЦИЯ describe the one-screen UI, tags, presets, editor, dislike-to-bin, chime, hotkeys; drop tab references.
- [ ] **Step 4: Verify** `grep -rn "Sketch Timer\|Sketch-Timer" --exclude-dir=node_modules --exclude-dir=docs/superpowers .` → no hits outside the old spec/plan; `npm run package:win` produces `release/MIYP-Timer-0.2.0-win32-x64.zip`.
- [ ] **Step 5: Commit** `chore: rename to MIYP Timer, add icon, update docs`.

### Task 10: Verify, PR, archive

- [ ] **Step 1:** `npm run typecheck && npm test && npm run e2e:linux` — all PASS; record counts.
- [ ] **Step 2:** Push `claude/miyp-redesign`, open PR «MIYP Timer: one-screen redesign», subscribe to PR activity, drive Windows CI to green.
- [ ] **Step 3:** Copy the CI Windows ZIP (with icon) to `/mnt/project-files/miyp-timer/MIYP-Timer-0.2.0-win32-x64.zip`.
