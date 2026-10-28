import fs from 'node:fs';
import path from 'node:path';

export interface DataDirInput {
  packaged: boolean;
  exeDir: string;
  appDir: string;
  env: Record<string, string | undefined>;
}

/** Данные лежат рядом с программой. Переменная SKETCH_DATA_DIR работает только в разработке и тестах. */
export function resolveDataDir({ packaged, exeDir, appDir, env }: DataDirInput): string {
  if (packaged) return path.join(exeDir, 'data');
  return env.SKETCH_DATA_DIR ? path.resolve(env.SKETCH_DATA_DIR) : path.join(appDir, 'data');
}

/** Проверяет запись пробным файлом. Бросает понятную ошибку с путём. */
export function assertWritable(dir: string): void {
  const probe = path.join(dir, `.write-test-${process.pid}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, '');
    fs.rmSync(probe);
  } catch (e) {
    throw new Error(`Нет доступа на запись в папку данных:\n${dir}\n\nПереместите программу в папку, куда можно писать (например, в «Документы»). Причина: ${(e as Error).message}`);
  }
}
