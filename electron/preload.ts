import { contextBridge, ipcRenderer } from 'electron';
import type { SketchApi } from '../src/shared/api';

const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(`sketch:${channel}`, ...args);

const api: SketchApi = {
  getState: () => call('state'),
  connectLibrary: () => call('library:connect'),
  syncLibrary: () => call('library:sync'),
  renameNew: () => call('library:rename'),
  getTree: () => call('library:tree'),
  toggleRating: (id, t) => call('rating:toggle', id, t),
  setRating: (id, r) => call('rating:set', id, r),
  listPresets: () => call('presets:list'),
  savePreset: (p) => call('presets:save', p),
  copyPreset: (id) => call('presets:copy', id),
  deletePreset: (id) => call('presets:delete', id),
  buildQueue: (ids, count) => call('session:queue', ids, count),
  recordView: (id, cycle) => call('session:view', id, cycle),
  undoView: (viewId) => call('session:unview', viewId),
  exportBackup: (v) => call('backup:export', v),
  importBackup: () => call('backup:import'),
  cycleStatus: (ids) => call('session:cycle', ids),
  trashImage: (id) => call('session:trash', id),
  getSettings: () => call('settings:get'),
  saveSettings: (p) => call('settings:save', p),
  setFullscreen: (on) => call('window:fullscreen', on),
  minimize: () => ipcRenderer.send('sketch:window', 'minimize'),
  close: () => ipcRenderer.send('sketch:window', 'close'),
};

contextBridge.exposeInMainWorld('sketch', api);
