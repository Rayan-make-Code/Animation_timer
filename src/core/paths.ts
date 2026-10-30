import path from 'node:path';

/**
 * Лежит ли abs строго внутри папки root. Сравнение через path.relative, а не по префиксу строки:
 * так работает и библиотека в корне диска (E:\), и соседняя папка с тем же началом имени (C:\Lib-evil) не проходит.
 */
export function insideRoot(root: string, abs: string, p: path.PlatformPath = path): boolean {
  const rel = p.relative(p.resolve(root), p.resolve(abs));
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + p.sep) && !p.isAbsolute(rel);
}
