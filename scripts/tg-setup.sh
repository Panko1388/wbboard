#!/usr/bin/env bash
# Настройка Telegram-отчётов: bash scripts/tg-setup.sh <BOT_TOKEN>
# До запуска: создайте бота у @BotFather (/newbot) и нажмите Start в чате с ботом.
set -euo pipefail
TOKEN="${1:-}"
[ -z "$TOKEN" ] && { echo "Использование: bash scripts/tg-setup.sh <BOT_TOKEN>"; exit 1; }
ENVF=/opt/wbboard/app/.env

ME=$(curl -s "https://api.telegram.org/bot$TOKEN/getMe")
echo "$ME" | grep -q '"ok":true' || { echo "❌ Токен не принят Telegram: $ME"; exit 1; }
BOTNAME=$(echo "$ME" | grep -o '"username":"[^"]*' | cut -d'"' -f4)
echo "Бот @$BOTNAME найден. Откройте его в Telegram и нажмите Start (или напишите что-нибудь)."
echo "Жду сообщение до 2 минут..."

CHAT=""
for i in $(seq 1 60); do
  CHAT=$(curl -s "https://api.telegram.org/bot$TOKEN/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*' | tail -1 | grep -o '\-\?[0-9]*$' || true)
  [ -n "$CHAT" ] && break
  sleep 2
done
[ -z "$CHAT" ] && { echo "❌ Сообщений боту нет. Напишите @$BOTNAME и запустите скрипт снова."; exit 1; }
echo "chat_id: $CHAT"

sed -i '/^TG_BOT_TOKEN=/d;/^TG_CHAT_ID_OWNER=/d' "$ENVF"
printf 'TG_BOT_TOKEN=%s\nTG_CHAT_ID_OWNER=%s\n' "$TOKEN" "$CHAT" >> "$ENVF"

# пересоздать контейнеры с новым env
bash /opt/wbboard/app/scripts/run-containers.sh
sleep 8

curl -s "https://api.telegram.org/bot$TOKEN/sendMessage" \
  -d chat_id="$CHAT" -d text="✅ WBboard подключён. Ежедневный отчёт за вчера — в 09:00 МСК." > /dev/null
echo "Пробный отчёт за вчера:"
docker exec wbboard-worker npx tsx scripts/report-now.ts || true
echo "✅ Готово. Отчёты будут приходить каждый день в 09:00 МСК."
