# Деплой WBboard

## Наш сервер — wboard.online (Timeweb 147.45.213.254)

Особенности, выясненные при настройке (детали в памяти проекта / notes):

- **SSH с Мака Андре не работает** (фильтрация Timeweb) → файлы заливаем через веб-консоль Timeweb:
  упаковать папку в tar.gz → загрузить на tmpfiles.org → в консоли сервер сам делает `curl -L <url> | tar xz -C /opt/wbboard/app`.
- **Caddy уже стоит** (wbboard-caddy) и терминирует TLS ручным сертификатом (`tls /certs`, продлить до ~11.08.2026) —
  наш Caddyfile НЕ применять, в существующем добавить `reverse_proxy app:3000`.
- **Postgres уже работает** (контейнер wbboard-db-1, в нём raw-таблицы от capture.py) — переиспользуем его:
  `DATABASE_URL` указать на него, `npx prisma db push` доложит свои таблицы рядом, capture.py продолжит писать своё.
  После запуска воркера cron с capture.py можно отключить (воркер забирает те же данные структурированно).
- **WB-токены обоих кабинетов** уже в `/opt/wbboard/.env` — перенести их в UI (Настройки → Кабинеты), а не в env.
- Docker Hub лимитит pull → образы тянуть через `mirror.gcr.io` (как делали с postgres).
- Токены «Базовые» делят лимит между кабинетами — воркер опрашивает кабинеты последовательно (уже учтено в коде).

## Вариант A — чистый VPS (RU VPS, Docker)

```bash
# 1. Скопировать папку wbboard на сервер (или git pull, если репозиторий настроен)
rsync -av --exclude node_modules --exclude .next wbboard/ user@SERVER:/opt/wbboard/

# 2. На сервере
cd /opt/wbboard
cp .env.example .env
nano .env   # AUTH_SECRET и TOKEN_KEY → openssl rand -hex 32; POSTGRES_PASSWORD сменить

# 3. Запуск (соберёт образ, накатит схему, загрузит роли + демо-данные)
docker compose up -d --build

# 4. Проверка
docker compose logs -f app   # ждать "ready"
curl -I http://localhost
```

Сайт доступен по `http://IP-сервера`. Команда заходит: `admin@wbboard.local / wbboard123`
(пароль сменить через SEED_ADMIN_PASSWORD до первого запуска или в Prisma Studio).

С доменом: вписать его в `Caddyfile` (раскомментировать блок) → `docker compose restart caddy` — TLS выпустится сам.

## Подключение реальных данных

1. Зайти как Собственник → **Настройки → Кабинеты WB** → добавить sid + read-only токен.
2. Нажать в Настройках кнопки `orders`, `sales`, `stocks`, `tariffs` — первый сбор пройдёт сразу
   (история заказов/продаж подтянется за 90 дней, финотчёты — с 29.01.2024).
3. Дальше воркер собирает сам по расписанию (orders/sales каждые 30 мин).
4. Демо-кабинет скрыть, когда пойдут реальные данные:
   `docker compose exec db psql -U wbboard -c "UPDATE \"Cabinet\" SET active=false WHERE sid='demo';"`

## Вариант B — локально (без Docker для приложения)

```bash
cd wbboard
cp .env.example .env
docker compose up -d db          # только Postgres
npm install
npx prisma db push && npm run seed
npm run dev                      # сайт на http://localhost:3000
npm run worker                   # в соседнем терминале — коллекторы
```

## Бэкапы (ADR-006)

```bash
# крон на сервере, ежедневно в 03:30; восстановление тестировать ежемесячно
docker compose exec -T db pg_dump -U wbboard wbboard | gzip > /backup/wbboard_$(date +%F).sql.gz
# затем отправить в offsite S3 (другой провайдер): rclone copy /backup remote:wbboard-backups
```

## Обновление версии

```bash
rsync -av --exclude node_modules --exclude .next wbboard/ user@SERVER:/opt/wbboard/
cd /opt/wbboard && docker compose up -d --build   # prisma db push накатит новые таблицы
```
