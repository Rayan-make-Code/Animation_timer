import { app, BrowserWindow, shell, dialog, ipcMain, net, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BackupError, exportBackup, importBackup } from '../src/core/backup';
import { openDb, type Db } from '../src/core/db';
import { listTree, syncLibrary } from '../src/core/library';
import { buildQueue, cycleStatus } from '../src/core/picker';
import { copyPreset, deletePreset, listPresets, savePreset } from '../src/core/presets';
import { IMAGE_COLUMNS, recordView, setRating, toggleRating, toImageRow, undoView } from '../src/core/ratings';
import { renameNewImages } from '../src/core/rename';
import { seedDefaultPresets } from '../src/core/defaults';
import { getSetting, parseIds, setSetting } from '../src/core/settings';
import { trashImage } from '../src/core/trash';
import { assertWritable, resolveDataDir } from './paths';

const APP_NAME = 'MIYP Timer';
const dataDir = resolveDataDir({
  packaged: app.isPackaged,
  exeDir: path.dirname(process.execPath),
  appDir: app.getAppPath(),
  env: app.isPackaged ? {} : process.env,
});
const devEnv = app.isPackaged ? {} as NodeJS.ProcessEnv : process.env;

let db: Db;
let win: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([{ scheme: 'sketch-image', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const libraryRoot = (): string | null => getSetting(db, 'library');

function requireRoot(): string {
  const root = libraryRoot();
  if (!root) throw new Error('Сначала подключите папку с изображениями.');
  if (!fs.existsSync(root)) throw new Error(`Папка библиотеки недоступна: ${root}\nПодключите её заново или проверьте диск.`);
  return root;
}

async function syncAndRename(root: string) {
  const sync = await syncLibrary(db, root);
  const rename = await renameNewImages(db, root);
  return { sync, rename };
}

const WIN_WIDTH = 406;
const WIN_MIN_HEIGHT = 560;
const WIN_MAX_HEIGHT = 10000;
// Высота окна до входа в полноэкранный режим.
let heightBeforeFullscreen = 760;

function setFullscreen(on: boolean) {
  if (!win) return;
  if (on) {
    heightBeforeFullscreen = win.getBounds().height;
    // На Windows ограничения размера мешают полноэкранному режиму — снимаем их.
    win.setMaximumSize(0, 0);
    win.setMinimumSize(0, 0);
    win.setFullScreen(true);
  } else {
    win.setFullScreen(false);
    win.setMinimumSize(WIN_WIDTH, WIN_MIN_HEIGHT);
    win.setMaximumSize(WIN_WIDTH, WIN_MAX_HEIGHT);
    win.setSize(WIN_WIDTH, heightBeforeFullscreen);
  }
}

/** Корзина: в тестах (SKETCH_FAKE_TRASH) файлы переносятся в указанную папку. */
function trashFile(absPath: string): Promise<void> {
  const fake = devEnv.SKETCH_FAKE_TRASH;
  if (!fake) return shell.trashItem(absPath);
  fs.mkdirSync(fake, { recursive: true });
  return fs.promises.rename(absPath, path.join(fake, path.basename(absPath)));
}

function createWindow() {
  win = new BrowserWindow({
    width: 406,
    height: 760,
    minWidth: 406,
    maxWidth: 406,
    minHeight: 560,
    frame: false,
    show: false,
    title: APP_NAME,
    backgroundColor: '#141519',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.once('ready-to-show', () => win?.show());
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function registerIpc() {
  const handle = (channel: string, fn: (...args: any[]) => unknown) => ipcMain.handle(`sketch:${channel}`, (_e, ...args) => fn(...args));

  handle('state', () => ({ library: libraryRoot(), dataDir, version: app.getVersion() }));
  handle('library:connect', async () => {
    const pick = await dialog.showOpenDialog(win!, { title: 'Папка с изображениями', defaultPath: libraryRoot() ?? undefined, properties: ['openDirectory'] });
    if (pick.canceled || !pick.filePaths[0]) return null;
    const root = pick.filePaths[0];
    setSetting(db, 'library', root);
    return syncAndRename(root);
  });
  handle('library:sync', () => syncAndRename(requireRoot()));
  handle('library:rename', () => renameNewImages(db, requireRoot()));
  handle('library:tree', () => listTree(db));
  handle('rating:toggle', (id: number, t: 1 | -1) => toggleRating(db, id, t));
  handle('rating:set', (id: number, r: -1 | 0 | 1) => setRating(db, id, r));
  handle('presets:list', () => listPresets(db));
  handle('presets:save', (p: Parameters<typeof savePreset>[1]) => savePreset(db, p));
  handle('presets:copy', (id: number) => copyPreset(db, id));
  handle('presets:delete', (id: number) => deletePreset(db, id));
  handle('session:queue', (ids: number[], count: number) => buildQueue(db, ids, count));
  handle('session:view', (id: number, cycle: number) => recordView(db, id, cycle));
  handle('session:unview', (viewId: number) => undoView(db, viewId));
  handle('session:cycle', (ids: number[]) => cycleStatus(db, ids));
  handle('session:trash', (id: number) => trashImage(db, requireRoot(), id, trashFile));
  handle('settings:get', () => {
    const raw = getSetting(db, 'selectedPreset');
    const preset = raw ? Number(raw) : NaN;
    return {
      selectedPreset: Number.isInteger(preset) ? preset : null,
      selectedCategories: parseIds(getSetting(db, 'selectedCategories')),
      firstRunDone: getSetting(db, 'firstRunDone') === '1',
    };
  });
  handle('settings:save', (p: { selectedPreset?: number | null; selectedCategories?: number[]; firstRunDone?: boolean }) => {
    if (p.selectedPreset !== undefined) setSetting(db, 'selectedPreset', p.selectedPreset === null ? '' : String(p.selectedPreset));
    if (p.selectedCategories !== undefined) setSetting(db, 'selectedCategories', JSON.stringify(p.selectedCategories));
    if (p.firstRunDone) setSetting(db, 'firstRunDone', '1');
  });
  handle('window:fullscreen', (on: boolean) => setFullscreen(on));
  handle('backup:export', async (includeViews: boolean) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await dialog.showSaveDialog(win!, { title: 'Резервная копия', defaultPath: `miyp-timer-${stamp}.sketchbackup.json`, filters: [{ name: 'Резервная копия', extensions: ['json'] }] });
    if (res.canceled || !res.filePath) return null;
    fs.writeFileSync(res.filePath, JSON.stringify(exportBackup(db, { includeViews }), null, 2), 'utf8');
    return res.filePath;
  });
  handle('backup:import', async () => {
    const res = await dialog.showOpenDialog(win!, { title: 'Импорт оценок и пресетов', properties: ['openFile'], filters: [{ name: 'Резервная копия', extensions: ['json'] }] });
    if (res.canceled || !res.filePaths[0]) return null;
    let data: unknown;
    try {
      data = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
    } catch {
      throw new BackupError('Не удалось прочитать файл: это не JSON.');
    }
    return importBackup(db, data);
  });
  ipcMain.on('sketch:window', (_e, action: 'minimize' | 'close') => {
    if (action === 'minimize') win?.minimize();
    else win?.close();
  });
}

function registerImageProtocol() {
  protocol.handle('sketch-image', (request) => {
    const id = Number(new URL(request.url).pathname.slice(1));
    const root = libraryRoot();
    const row = db.prepare(`select ${IMAGE_COLUMNS} from images where id = ?`).get(id);
    if (!root || !row) return new Response('Not found', { status: 404 });
    const file = path.resolve(root, ...toImageRow(row).relPath.split('/'));
    // Отдаём только файлы внутри библиотеки.
    if (!file.startsWith(path.resolve(root) + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

app.whenReady().then(() => {
  try {
    assertWritable(dataDir);
    db = openDb(path.join(dataDir, 'sketch-timer.db'));
  } catch (e) {
    // В тестах модальное окно нельзя закрыть, поэтому там ошибка идёт в stderr.
    if (devEnv.SKETCH_NO_ERROR_DIALOG) console.error((e as Error).message);
    else dialog.showErrorBox(APP_NAME, (e as Error).message);
    app.exit(1);
    return;
  }
  seedDefaultPresets(db);
  registerImageProtocol();
  registerIpc();
  createWindow();
  // Сверка библиотеки при запуске; ошибки (например, отключённый диск) не мешают открыть приложение.
  const root = libraryRoot();
  if (root && fs.existsSync(root) && !devEnv.SKETCH_SKIP_STARTUP_SYNC) syncAndRename(root).catch(() => undefined);
});

app.on('window-all-closed', () => app.quit());
