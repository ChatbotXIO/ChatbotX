#!/bin/bash

cd /app/apps/partysocket;
NODE_OPTIONS=--no-node-snapshot HOSTNAME=${HOSTNAME:-0.0.0.0} PORT=${PORT:-1999} pnpm dlx partykit dev;
