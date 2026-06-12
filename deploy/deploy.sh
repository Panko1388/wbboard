#!/usr/bin/env bash
# WBboard — деплой на наш VPS (Timeweb, wboard.online). Идемпотентен, безопасно перезапускать.
# Ожидает: исходники распакованы в /opt/wbboard/app, рядом живут wbboard-db-1 и wbboard-caddy.
set -uo pipefail
cd /opt/wbboard/app
LOG(){ echo -e "\n=== $* ==="; }

# ── 0. проверки окружения ─────────────────────────────────────────
docker inspect wbboard-db-1 >/dev/null 2>&1 || { echo "❌ Контейнер wbboard-db-1 не найден"; exit 1; }
NET=$(docker inspect wbboard-db-1 --format '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' | head -1)
LOG "Сеть docker: $NET"

DBENV=$(docker inspect wbboard-db-1 --format '{{range .Config.Env}}{{println .}}{{end}}')
DBU=$(echo "$DBENV" | awk -F= '/^POSTGRES_USER=/{print $2}');      DBU=${DBU:-postgres}
DBP=$(echo "$DBENV" | awk -F= '/^POSTGRES_PASSWORD=/{print $2}');  DBP=${DBP:-}
DBN=$(echo "$DBENV" | awk -F= '/^POSTGRES_DB=/{print $2}');        DBN=${DBN:-$DBU}
LOG "Postgres: user=$DBU db=$DBN (пароль из контейнера)"

# Отдельная БД приложения: старые таблицы capture.py в "$DBN" не трогаем
# (prisma db push приводит БД к схеме и снёс бы sales_raw/orders_raw/cursors)
APPDB=wbboard_app
docker exec wbboard-db-1 psql -U "$DBU" -d "$DBN" -tAc "SELECT 1 FROM pg_database WHERE datname='$APPDB'" | grep -q 1 \
  || docker exec wbboard-db-1 psql -U "$DBU" -d "$DBN" -c "CREATE DATABASE $APPDB" \
  || { echo "❌ Не удалось создать БД $APPDB"; exit 1; }
LOG "БД приложения: $APPDB (данные capture.py остаются в $DBN)"

# ── 1. .env приложения (создаётся один раз, секреты сохраняются) ──
ENVF=/opt/wbboard/app/.env
if [ ! -f "$ENVF" ]; then
  ADMPWD=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 12)
  MGRPWD=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 12)
  cat > "$ENVF" <<EOF
DATABASE_URL=postgresql://$DBU:$DBP@wbboard-db-1:5432/$APPDB
AUTH_SECRET=$(openssl rand -hex 32)
TOKEN_KEY=$(openssl rand -hex 32)
SEED_ADMIN_PASSWORD=$ADMPWD
SEED_MANAGER_PASSWORD=$MGRPWD
SEED_DEMO=0
PHOTOCHECK_MOCK=1
EST_LOGISTICS_RUB=55
EST_STORAGE_RUB=6
FX_ALERT_PCT=5
UPLOAD_DIR=/data/uploads
EOF
  chmod 600 "$ENVF"
  LOG "Создан $ENVF (владелец: $ADMPWD, менеджер: $MGRPWD)"
else
  ADMPWD=$(awk -F= '/^SEED_ADMIN_PASSWORD=/{print $2}' "$ENVF")
  MGRPWD=$(awk -F= '/^SEED_MANAGER_PASSWORD=/{print $2}' "$ENVF")
  if [ -z "$MGRPWD" ]; then
    MGRPWD=$(openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 12)
    echo "SEED_MANAGER_PASSWORD=$MGRPWD" >> "$ENVF"
  fi
  # перенаправить существующий .env на БД приложения (идемпотентно)
  DBPE=$(printf '%s' "$DBP" | sed 's/[&|\\]/\\&/g')
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://$DBU:$DBPE@wbboard-db-1:5432/$APPDB|" "$ENVF"
  LOG "$ENVF уже есть — секреты сохранены, DATABASE_URL → $APPDB"
fi

# ── 2. базовый образ через зеркало (Docker Hub лимитит) ───────────
LOG "Сборка образа"
# воркер останавливаем на время сборки: next build + tsx на 4 ГБ — риск OOM (риск-аудит #8)
docker stop wbboard-worker 2>/dev/null || true
BASE=mirror.gcr.io/library/node:22-alpine
docker pull $BASE >/dev/null 2>&1 || { BASE=node:22-alpine; docker pull $BASE >/dev/null 2>&1 || true; }
docker build --build-arg BASE=$BASE -t wbboard-app:latest . || { echo "❌ Сборка не удалась"; docker start wbboard-worker 2>/dev/null; exit 1; }

# ── 3. схема БД + сид (роли/пользователи) + импорт WB-токенов ─────
# Из старого /opt/wbboard/.env берём ТОЛЬКО WB_TOKEN_* (со снятием кавычек):
# целиком файл подключать нельзя — его DATABASE_URL="..." в кавычках ломает Prisma.
LOG "Схема БД и сид"
TOKEN_ARGS=""
if [ -f /opt/wbboard/.env ]; then
  while IFS= read -r line; do
    case "$line" in
      WB_TOKEN_*=*)
        k=${line%%=*}; v=${line#*=}
        v=${v%\"}; v=${v#\"}; v=${v%\'}; v=${v#\'}
        [ -n "$v" ] && TOKEN_ARGS="$TOKEN_ARGS -e $k=$v"
        ;;
    esac
  done < /opt/wbboard/.env
fi
docker run --rm --network "$NET" --env-file "$ENVF" $TOKEN_ARGS wbboard-app:latest \
  sh -c "npx prisma db push --skip-generate && npx tsx prisma/seed.ts && npx tsx scripts/import-cabinets.ts" \
  || { echo "❌ db push/seed не прошли"; exit 1; }

# ── 4. запуск контейнеров (команды сохраняются для tg-setup) ──────
mkdir -p /opt/wbboard/app/uploads
cat > /opt/wbboard/app/scripts/run-containers.sh <<EOF
#!/usr/bin/env bash
docker rm -f wbboard-app wbboard-worker 2>/dev/null || true
docker run -d --name wbboard-app --restart unless-stopped --network $NET \\
  --env-file $ENVF -v /opt/wbboard/app/uploads:/data/uploads \\
  -p 127.0.0.1:3000:3000 wbboard-app:latest npm run start
docker run -d --name wbboard-worker --restart unless-stopped --network $NET \\
  --env-file $ENVF -v /opt/wbboard/app/uploads:/data/uploads \\
  wbboard-app:latest npm run worker
EOF
chmod +x /opt/wbboard/app/scripts/run-containers.sh
LOG "Запуск app + worker"
bash /opt/wbboard/app/scripts/run-containers.sh
sleep 6

# ── 5. Caddy → reverse_proxy на приложение ────────────────────────
LOG "Caddy"
docker network connect "$NET" wbboard-caddy 2>/dev/null || true
CADDYFILE=$(docker inspect wbboard-caddy --format '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' 2>/dev/null)
if [ -n "$CADDYFILE" ] && [ -f "$CADDYFILE" ]; then
  cp "$CADDYFILE" "$CADDYFILE.bak.$(date +%s)"
  if grep -q 'reverse_proxy' "$CADDYFILE"; then
    sed -i -E 's|reverse_proxy[[:space:]]+[^{ ]+|reverse_proxy wbboard-app:3000|g' "$CADDYFILE"
  else
    # вставить в конец первого блока сайта
    awk '1; /^[^#].*\{/ && !done {print "\treverse_proxy wbboard-app:3000"; done=1}' "$CADDYFILE" > "$CADDYFILE.tmp" \
      && mv "$CADDYFILE.tmp" "$CADDYFILE"
  fi
  docker exec wbboard-caddy caddy reload --config /etc/caddy/Caddyfile 2>&1 | tail -1 || docker restart wbboard-caddy
  echo "Caddyfile обновлён ($CADDYFILE):"; grep -n 'reverse_proxy' "$CADDYFILE" || true
else
  echo "⚠️ Caddyfile не найден через mounts — проксирование настроить вручную: reverse_proxy wbboard-app:3000"
fi

# ── 6. первичный сбор данных (фон, ~10-30 мин из-за лимитов WB) ───
LOG "Первичный сбор данных (фон)"
docker exec -d wbboard-worker npx tsx scripts/collect-once.ts || true

# ── 7. итог ───────────────────────────────────────────────────────
sleep 4
LOG "ПРОВЕРКА"
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'wbboard|caddy' || true
echo "health: $(curl -s http://127.0.0.1:3000/api/health || echo 'нет ответа')"
echo "https:  $(curl -sk -o /dev/null -w '%{http_code}' https://wboard.online/login || true)"
echo
docker image prune -f >/dev/null 2>&1 || true # мусор от прошлых сборок (риск-аудит #6)
echo "════════════════════════════════════════════════"
echo " WBboard: https://wboard.online"
echo " Владелец:  admin@wbboard.local    / $ADMPWD"
echo " Менеджер:  manager@wbboard.local  / $MGRPWD"
echo " Сменить пароль: docker exec wbboard-app npx tsx scripts/set-password.ts <email> [пароль]"
echo
echo " Telegram-отчёты: bash /opt/wbboard/app/scripts/tg-setup.sh <ТОКЕН_БОТА>"
echo " Прогресс сбора:  docker logs --tail 30 wbboard-worker"
echo "════════════════════════════════════════════════"
