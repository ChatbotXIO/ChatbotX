#!/bin/bash
set -eu

# Deshabilita maintenance mode en el server de ChatbotX.
#
# Variables de entorno (las pasa el workflow):
#   SSH_USER, SERVER, WORKSPACE
#
# Elimina el archivo .maintenance. CI corre esto solo si deploy + smoke
# salieron OK; si smoke falla, se queda en maintenance.

echo "Disabling maintenance mode on ${SERVER}"

ssh -o StrictHostKeyChecking=no ${SSH_USER}@${SERVER} \
  "rm -f ${WORKSPACE}/.maintenance"

echo "Maintenance mode disabled on ${SERVER}"
