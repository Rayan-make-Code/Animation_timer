// Vite не знает node:sqlite как встроенный модуль, поэтому берём его через process.getBuiltinModule.
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';

type SqliteModule = typeof import('node:sqlite');
const mod = process.getBuiltinModule('node:sqlite') as SqliteModule;

export const DatabaseSync = mod.DatabaseSync;
export type DatabaseSync = DatabaseSyncType;
