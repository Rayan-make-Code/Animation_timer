import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

export interface Running { app: ElectronApplication; win: Page; dataDir: string }

export function tempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sketch-e2e-'));
}

/** Минимальный валидный PNG 8×8 заданного цвета. */
export function png(r: number, g: number, b: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 8 }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: 8 }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Библиотека: Позы/ (3 png + gif), Лица/Мужские/ (1 png). */
export function makeLibrary(): string {
  const root = path.join(tempRoot(), 'Мои рисунки');
  for (const [rel, data] of [
    ['Позы/a.png', png(200, 30, 30)],
    ['Позы/b.png', png(30, 200, 30)],
    ['Позы/c.png', png(30, 30, 200)],
    ['Позы/anim.gif', Buffer.from('GIF89a')],
    ['Лица/Мужские/d.png', png(200, 200, 30)],
  ] as [string, Buffer][]) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), data);
  }
  return root;
}

export async function launch(dataDir = path.join(tempRoot(), 'data'), library?: string): Promise<Running> {
  const app = await electron.launch({
    args: ['.', '--no-sandbox'],
    env: { ...process.env, SKETCH_DATA_DIR: dataDir, SKETCH_SKIP_STARTUP_SYNC: '1' } as Record<string, string>,
  });
  if (library) {
    // Нативный диалог выбора папки подменяется в главном процессе.
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dialog.showOpenDialog;
    }, library);
  }
  const win = await app.firstWindow();
  await win.waitForSelector('.app');
  return { app, win, dataDir };
}

export function query<T>(dataDir: string, sql: string): T[] {
  const db = new DatabaseSync(path.join(dataDir, 'sketch-timer.db'));
  try {
    return db.prepare(sql).all() as T[];
  } finally {
    db.close();
  }
}
