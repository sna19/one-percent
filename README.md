# 1% — личная система целей

Личное приложение для движения к целям маленькими ежедневными шагами («1% в день»).
Не трекер привычек, а система: инкубатор идей → ворота WIP → цели с майлстонами → ежедневный трекер → ретро.

**Статус:** v0.1 в работе (Spec 001): каркас готов.

## Документы
- [CLAUDE.md](CLAUDE.md) — контекст и правила для Claude Code
- [docs/CONCEPT.md](docs/CONCEPT.md) — концепция: проблема, принципы, цикл, визуализация
- [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md) — сущности, поля, правила, глоссарий
- [docs/DECISIONS.md](docs/DECISIONS.md) — журнал принятых решений
- [docs/BACKLOG.md](docs/BACKLOG.md) — этапы и порядок реализации

## Стек
SvelteKit (adapter-node, TypeScript) + SQLite в одном файле (`better-sqlite3`). Обоснование — в DECISIONS.md.

## Разработка
```sh
npm install
npm run dev      # http://localhost:5173, данные в ./data
npm run check    # проверка типов
npm test         # тесты
```

## Запуск на NAS
Образ собирается из `Dockerfile`. Compose принадлежит владельцу и лежит вне репозитория
(`/volume3/docker/one-percent/`). Минимум, который ему нужен:

```yaml
services:
  app:
    build: /volume3/dev/one-percent   # путь к клону репозитория
    restart: always
    ports: ["3000:3000"]              # к порту ходит только cloudflared
    volumes: ["./data:/data"]
```

Приложение слушает порт 3000; `GET /health` отвечает 200, если файл данных доступен.
Данные — один файл `/data/one-percent.db` (на NAS: `./data/one-percent.db` рядом с compose).

## Бэкап и восстановление
Бэкап (безопасен при работающем приложении, хранит 30 последних копий):
```sh
docker compose exec app node scripts/backup.mjs     # → ./data/backups/one-percent-<время>.db
```
Для регулярного бэкапа — та же команда в DSM Task Scheduler раз в сутки; папку `./data/backups` забирает Hyper Backup.

Восстановление:
```sh
docker compose stop app
rm -f data/one-percent.db-wal data/one-percent.db-shm
cp data/backups/one-percent-<время>.db data/one-percent.db
docker compose start app
```
