# Sketch Timer

Портативное Windows-приложение для практики набросков: подключает вашу папку с изображениями и проводит интервальные сессии (работа/отдых, группы повторов) с полноэкранным показом.

- Продукт: [docs/product.md](docs/product.md)
- Спецификация: [docs/superpowers/specs/2026-10-28-sketch-timer-design.md](docs/superpowers/specs/2026-10-28-sketch-timer-design.md)
- План: [docs/superpowers/plans/2026-10-28-sketch-timer.md](docs/superpowers/plans/2026-10-28-sketch-timer.md)
- Для пользователя: [docs/ИНСТРУКЦИЯ.md](docs/ИНСТРУКЦИЯ.md)

## Разработка

Стек: Electron + React + TypeScript, SQLite через встроенный `node:sqlite` (Node ≥ 22.13).

```bash
npm install
npm test            # Vitest: вся логика в src/core
npm run typecheck
npm start           # собрать и запустить (данные в ./data)
npm run e2e         # Playwright + Electron (на Linux: npm run e2e:linux)
npm run package:win # портативный ZIP в release/
```

Структура: `src/core` — логика без Electron (база, библиотека, переименование, выбор, таймер, бэкап), `electron/` — окно и IPC, `src/renderer` — интерфейс.
