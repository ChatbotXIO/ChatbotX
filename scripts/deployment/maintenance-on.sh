#!/bin/bash
set -eu

# Habilita maintenance mode en el server de ChatbotX.
#
# Variables de entorno (las pasa el workflow):
#   SSH_USER, SERVER, WORKSPACE
#
# Crea un archivo .maintenance en el workspace. Caddy (o el entrypoint) lo
# puede chequear para mostrar una página de mantenimiento.

echo "Enabling maintenance mode on ${SERVER}"

ssh -o StrictHostKeyChecking=no ${SSH_USER}@${SERVER} \
  "touch ${WORKSPACE}/.maintenance"

echo "Maintenance mode enabled on ${SERVER}"
