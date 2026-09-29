#!/bin/bash

cd /app/apps/realtime;
umask 077
printf 'REALTIME_BROADCAST_SECRET=%s\nNEXT_PUBLIC_BUILDER_URL=%s\n' \
  "${REALTIME_BROADCAST_SECRET:?REALTIME_BROADCAST_SECRET is required}" \
  "${NEXT_PUBLIC_BUILDER_URL:-http://localhost:3123}" > .env
NODE_OPTIONS=--no-node-snapshot HOSTNAME=${HOSTNAME:-0.0.0.0} PORT=${PORT:-1999} pnpm exec partykit dev;
