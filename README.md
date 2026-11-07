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
    ports: ["3001:3000"]              # 3000 на NAS занят openGym
    volumes: ["./data:/data"]
```

Адреса:
- снаружи и с рабочего iPhone — https-адрес Cloudflare (вход по коду Access);
- с устройств в Tailscale — `http://100.75.53.22:3001/`. По http работают экран, отметка и настройки,
  но приложение не откроется без сети: service worker браузер запускает только на https.
У каждого адреса своё хранилище офлайн-данных, поэтому на телефоне лучше держать на экране «Домой» один адрес.

Процесс в контейнере работает от пользователя `node` (uid 1000), ему нужна запись в папку данных.
Если `/health` отвечает `unable to open database file`:
```sh
sudo chown -R 1000:1000 /volume3/docker/one-percent/data
```

После нового коммита образ нужно пересобрать, перезапуска мало:
```sh
cd /volume3/docker/one-percent && sudo docker compose up -d --build
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
