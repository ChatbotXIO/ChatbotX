#!/bin/bash
set -eu

# Deploy — ChatbotX (equivalente a deploy-v3.sh de sysbrazo)
#
# Corre DESDE el runner (como deploy-v3.sh). Se conecta por SSH al server
# y ejecuta: git pull + baja el secret de AWS → .env + docker compose up.
#
# Variables de entorno (las pasa el workflow):
#   SSH_USER, SERVER, WORKSPACE, SECRET_NAME, ENV
#
# El maintenance mode lo manejan maintenance-on.sh / maintenance-off.sh
# (jobs dedicados del workflow), no este script — igual que sysbrazo.

echo "Deploying ChatbotX to ${SERVER} (${ENV})"

# 1. Pull + generar .env + levantar contenedores, TODO en el server.
#    El secret de AWS lo baja la instancia (IAM role). El secret está en
#    formato JSON, así que se convierte a KEY=value para el .env.
ssh -o StrictHostKeyChecking=no ${SSH_USER}@${SERVER} "
  set -eu
  cd ${WORKSPACE} || exit 1;

  echo 'Pulling latest code';
  git pull --ff-only;

  echo 'Generating .env from AWS Secrets Manager';
  aws secretsmanager get-secret-value \
    --secret-id ${SECRET_NAME} \
    --region ${AWS_REGION:-us-west-2} \
    --query SecretString --output text \
    | python3 -c 'import sys, json; [print(f\"{k}={v}\") for k, v in json.load(sys.stdin).items()]' > .env;

  echo 'Building and starting containers';
  docker compose ${COMPOSE_FILES} up -d --build;
"

echo "Deploy completed on ${SERVER}"
