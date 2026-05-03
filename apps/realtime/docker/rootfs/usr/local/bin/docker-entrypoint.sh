#!/bin/bash

cd /app/apps/realtime;
NODE_OPTIONS=--no-node-snapshot HOSTNAME=${HOSTNAME:-0.0.0.0} PORT=${PORT:-1999} pnpm dlx partykit dev;
