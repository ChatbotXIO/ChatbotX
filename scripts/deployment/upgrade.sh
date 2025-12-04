#!/bin/bash

# pull new images
docker compose -f docker-compose.prod.yml pull builder worker realtime

# stop old containers
docker compose -f docker-compose.prod.yml down builder worker realtime

# start new containers
docker compose -f docker-compose.prod.yml up -d builder worker realtime

# remove old images
docker system prune -f
