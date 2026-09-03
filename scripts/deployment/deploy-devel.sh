#!/bin/bash
# Deploy devel — ChatbotX
# Vive en el server: /var/www/chatbotx-dev/scripts/deployment/deploy-devel.sh
# Hace el deploy real (se ejecuta DENTRO del server, como deploy-v3.sh de sysbrazo)
set -euo pipefail

# Región y secret de AWS (igual que sysbrazo: las credenciales viven en la instancia)
AWS_REGION=us-west-2
SECRET_NAME=dev/chatbotx/all-secret

echo "→ Bajo el secret desde AWS Secrets Manager (${SECRET_NAME})..."

# El secret está guardado como JSON (Key/Value en consola). Lo bajo y lo
# convierto a formato KEY=value (una por línea) para el .env.
aws secretsmanager get-secret-value \
  --secret-id "${SECRET_NAME}" \
  --region "${AWS_REGION}" \
  --query SecretString --output text \
  | python3 -c "import sys, json; [print(f'{k}={v}') for k, v in json.load(sys.stdin).items()]" > .env

echo "→ .env generado ($(wc -l < .env) variables). Levantando con Docker Compose..."
docker compose -f docker-compose.yml -f docker-compose.apps.yml -f docker-compose.dev.yml up -d --build

echo "→ Deploy completado."
