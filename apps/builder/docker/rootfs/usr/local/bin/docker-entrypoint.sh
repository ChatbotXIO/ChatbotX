#!/bin/sh

# Run migrations
./node_modules/.bin/prisma migrate deploy --schema=packages/database/prisma/schema.prisma;

NODE_OPTIONS=--no-node-snapshot HOSTNAME=${HOSTNAME:-0.0.0.0} PORT=${PORT:-3000} node apps/builder/server.js;
