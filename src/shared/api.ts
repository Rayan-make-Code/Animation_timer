import type { ImportReport } from '../core/backup';
import type { CategoryNode, SyncResult } from '../core/library';
import type { QueueItem } from '../core/picker';
import type { NewPreset, Preset } from '../core/presets';
import type { ImageRow, Rating } from '../core/ratings';
import type { RenameReport } from '../core/rename';

export type { CategoryNode, ImageRow, ImportReport, NewPreset, Preset, QueueItem, Rating, RenameReport, SyncResult };

export interface AppState { library: string | null; dataDir: string; version: string }

/** Мост main ↔ renderer. Ошибки приходят как отклонённые промисы с русским текстом. */
export interface SketchApi {
  getState(): Promise<AppState>;
  /** Диалог выбора папки + первичная синхронизация и переименование. null — пользователь отменил. */
  connectLibrary(): Promise<{ sync: SyncResult; rename: RenameReport } | null>;
  /** Сверка с диском; новые файлы переименовываются автоматически. */
  syncLibrary(): Promise<{ sync: SyncResult; rename: RenameReport }>;
  renameNew(): Promise<RenameReport>;
  getTree(): Promise<CategoryNode[]>;
  listRated(rating: 1 | -1): Promise<ImageRow[]>;
  toggleRating(imageId: number, target: 1 | -1): Promise<Rating>;
  setRating(imageId: number, rating: Rating): Promise<void>;
  listPresets(): Promise<Preset[]>;
  savePreset(p: NewPreset & { id?: number }): Promise<number>;
  copyPreset(id: number): Promise<number>;
  deletePreset(id: number): Promise<void>;
  buildQueue(categoryIds: number[], count: number): Promise<QueueItem[]>;
  recordView(imageId: number, cycle: number): Promise<number>;
  undoView(viewId: number): Promise<void>;
  /** Диалог сохранения. Возвращает путь файла или null при отмене. */
  exportBackup(includeViews: boolean): Promise<string | null>;
  importBackup(): Promise<ImportReport | null>;
  setFullscreen(on: boolean): Promise<void>;
  minimize(): void;
  close(): void;
}

export const imageUrl = (id: number) => `sketch-image://img/${id}`;
