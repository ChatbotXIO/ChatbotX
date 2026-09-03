#!/bin/bash
set -eu

# Smoke tests — ChatbotX (equivalente a run-smoke-tests.sh de sysbrazo)
#
# Variables de entorno (las pasa el workflow):
#   SSH_USER, SERVER, PORT (default 3123)
#
# Corre los checks críticos de salud DESDE el server (vía SSH), no desde el
# runner — porque el server puede estar en una red privada.

PORT="${PORT:-3123}"

echo "Running smoke tests on ${SERVER}"

# Health check del builder
HTTP_CODE=$(ssh -o StrictHostKeyChecking=no ${SSH_USER}@${SERVER} \
  "curl -sf -o /dev/null -w '%{http_code}' http://localhost:${PORT}/api/health" \
  || echo "000")

echo "Builder health: HTTP ${HTTP_CODE}"

if [ "${HTTP_CODE}" != "200" ]; then
  echo "SMOKE FAILED: builder health returned ${HTTP_CODE}" >&2
  exit 1
fi

echo "Smoke tests passed on ${SERVER}"
