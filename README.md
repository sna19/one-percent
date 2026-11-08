# 1% — личная система целей

Личное приложение для движения к целям маленькими ежедневными шагами («1% в день»).
Не трекер привычек, а система: инкубатор идей → ворота WIP → цели с майлстонами → ежедневный трекер → ретро.

**Статус:** v0.1 (Spec 001) реализован, ждёт приёмки владельцем на iPhone.

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
    user: "1026:100"                  # владелец файлов на NAS
    ports: ["127.0.0.1:3001:3000"]    # только для Caddy-замка, наружу не публикуется
    volumes: ["./data:/data"]
```

Адрес один, дома и снаружи: **https://tracker.morray-iguana.ts.net**.
Путь запроса: sidecar Tailscale `ts-tracker` → Funnel → Caddy-замок (`127.0.0.1:8097`, пароль + cookie) → приложение (`127.0.0.1:3001`).
Sidecar, Caddy и compose настраивает владелец, вне репозитория. Решение — в `docs/DECISIONS.md` от 2026-11-08.

После нового коммита образ нужно пересобрать: перезапуск и «Собрать» в Container Manager при существующем образе его не обновляют.
```sh
cd /volume3/docker/one-percent && sudo docker compose build && sudo docker compose up -d
```
`/health` показывает время сборки (`built`): по нему видно, что работает свежий образ.

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
