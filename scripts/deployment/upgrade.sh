#!/bin/bash

set -x

COMPOSE_FILES="-f docker-compose.yml -f docker-compose.apps.yml -f docker-compose.prod.yml"

# pull new images
docker compose $COMPOSE_FILES pull builder worker realtime

# stop old containers
docker compose $COMPOSE_FILES down builder worker realtime

# start new containers
docker compose $COMPOSE_FILES up -d builder worker realtime

# remove old images
docker system prune -f
