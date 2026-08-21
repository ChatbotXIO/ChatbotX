#!/usr/bin/env bash
# ChatbotX — arranque local (fork fibrazo/sysbrazo)
#
# Uso:
#   bash scripts/start.sh           → arranca todo (builder ya buildeado, rápido)
#   bash scripts/start.sh --build   → rebuild del builder y arranca (1ª vez o tras cambios)
#   bash scripts/start.sh --dev     → builder en modo dev (hot-reload, lento)
set -uo pipefail

cd "$(dirname "$0")/.."   # raíz del repo

BUILD=0
MODE="prod"
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --dev) MODE="dev" ;;
  esac
done

echo "=== 1/6 Infraestructura (postgres/redis/s3) ==="
docker compose up -d postgres redis filesystem filesystem-init

echo "=== 2/6 ngrok (2 túneles) ==="
if ! pgrep -f 'ngrok start' >/dev/null 2>&1; then
  nohup ngrok start --all > /tmp/opencode/ngrok.log 2>&1 &
  sleep 5
  echo "ngrok arrancado"
else
  echo "ngrok ya estaba corriendo"
fi

echo "=== 3/6 URL del túnel chatbotx ==="
CHATBOTX_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
  | python3 -c "import json,sys; ts=[t for t in json.load(sys.stdin).get('tunnels',[]) if t.get('name')=='chatbotx']; print(ts[0]['public_url'] if ts else '')" 2>/dev/null)
if [ -z "$CHATBOTX_URL" ]; then
  echo "⚠ No encontré el túnel 'chatbotx'. Revisá ngrok (paso 2)."
else
  echo "URL chatbotx: $CHATBOTX_URL"

  echo "=== 4/6 Actualizar .env ==="
  sed -i "s#^NEXT_PUBLIC_BROKER_URL=.*#NEXT_PUBLIC_BROKER_URL=${CHATBOTX_URL}#" .env

  echo "=== 5/6 Webhook de Telegram ==="
  BOT_TOKEN=$(docker exec chatbotx-postgres-1 psql -U chatbotx -d chatbotx -t -A \
    -c "SELECT auth->>'secretText' FROM \"IntegrationTelegram\" LIMIT 1;" 2>/dev/null)
  BOT_ID=$(docker exec chatbotx-postgres-1 psql -U chatbotx -d chatbotx -t -A \
    -c "SELECT \"botId\" FROM \"IntegrationTelegram\" LIMIT 1;" 2>/dev/null)
  if [ -n "$BOT_TOKEN" ]; then
    curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
      -H 'content-type: application/json' \
      -d "{\"url\":\"${CHATBOTX_URL}/integrations/telegram/webhook?botId=${BOT_ID}\"}" \
      | python3 -m json.tool
  else
    echo "⚠ Sin bot de Telegram conectado — salteo el webhook."
  fi
fi

echo "=== 6/6 Apps ==="
# worker + realtime (dev: livianos, no son los que demoran)
setsid env NODE_OPTIONS='--dns-result-order=ipv4first --no-network-family-autoselection' pnpm --filter worker dev > /tmp/opencode/worker-dev.log 2>&1 < /dev/null &
nohup pnpm --filter realtime dev > /tmp/opencode/realtime-dev.log 2>&1 &

# builder
if [ "$MODE" = "dev" ]; then
  echo "Builder en DEV (hot-reload, lento)..."
  nohup pnpm --filter builder dev > /tmp/opencode/builder-dev.log 2>&1 &
elif [ "$BUILD" = "1" ] || [ ! -f apps/builder/.next/BUILD_ID ]; then
  echo "Build del builder (tarda unos minutos la primera vez)..."
  pnpm exec turbo build --concurrency=2
  setsid env NODE_OPTIONS='--dns-result-order=ipv4first --no-network-family-autoselection' pnpm --filter builder exec dotenv -e .env -e ../../.env -- next start -p 3123 \
    > /tmp/opencode/builder-prod.log 2>&1 < /dev/null &
else
  echo "Builder en PROD (ya buildeado)..."
  setsid env NODE_OPTIONS='--dns-result-order=ipv4first --no-network-family-autoselection' pnpm --filter builder exec dotenv -e .env -e ../../.env -- next start -p 3123 \
    > /tmp/opencode/builder-prod.log 2>&1 < /dev/null &
fi

echo ""
echo "✅ Listo."
echo "   Builder  → http://localhost:3123  (log: /tmp/opencode/builder-prod.log)"
echo "   Realtime → http://localhost:1999"
echo ""
echo "Verificar Telegram:"
echo "   docker exec chatbotx-postgres-1 psql -U chatbotx -d chatbotx -c 'SELECT \"createdAt\", left(\"text\",40) FROM \"Message\" ORDER BY \"createdAt\" DESC LIMIT 3;'"
