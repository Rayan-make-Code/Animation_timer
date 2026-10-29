// Портативная сборка для Windows 10/11 x64: release/MIYP-Timer-<версия>-win32-x64.zip
import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses';
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const out = path.join(root, 'release');
fs.rmSync(out, { recursive: true, force: true });

// Иконка exe вшивается через rcedit, которому вне Windows нужен wine; без него сборку делаем без иконки.
let icon = path.join(root, 'build', 'icon.ico');
if (process.platform !== 'win32') {
  let hasWine = true;
  try {
    execFileSync('wine', ['--version'], { stdio: 'ignore' });
  } catch {
    hasWine = false;
  }
  if (!hasWine) {
    console.warn('Предупреждение: wine не найден, иконка exe пропущена (rcedit требует wine).');
    icon = undefined;
  }
}

const [appDir] = await packager({
  dir: root,
  out,
  name: 'MIYP-Timer',
  executableName: 'MIYP Timer',
  ...(icon ? { icon } : {}),
  platform: 'win32',
  arch: 'x64',
  appVersion: pkg.version,
  asar: true,
  prune: true,
  overwrite: true,
  // В сборку попадают только скомпилированные файлы и package.json.
  ignore: (file) => file !== '' && !/^\/(dist(\/|$)|package\.json$)/.test(file),
});

// Предохранители Electron: exe нельзя запустить как Node, подключить отладчик или подменить код вне app.asar.
await flipFuses(path.join(appDir, 'MIYP Timer.exe'), {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
});

fs.copyFileSync(path.join(root, 'docs', 'ИНСТРУКЦИЯ.md'), path.join(appDir, 'ИНСТРУКЦИЯ.md'));
fs.writeFileSync(path.join(appDir, 'version.txt'), `MIYP Timer ${pkg.version}\n`);

const zipName = `MIYP-Timer-${pkg.version}-win32-x64.zip`;
if (process.platform === 'win32') {
  // 7-Zip сохраняет кириллические имена файлов в UTF-8; Compress-Archive — запасной вариант.
  try {
    execFileSync('7z', ['a', '-tzip', zipName, path.basename(appDir)], { cwd: out, stdio: 'inherit' });
  } catch {
    const ps = (p) => `'${p.replaceAll("'", "''")}'`;
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path ${ps(appDir)} -DestinationPath ${ps(path.join(out, zipName))} -Force`], { stdio: 'inherit' });
  }
} else {
  execFileSync('zip', ['-qr', zipName, path.basename(appDir)], { cwd: out, stdio: 'inherit' });
}
console.log(`Готово: release/${zipName}`);
