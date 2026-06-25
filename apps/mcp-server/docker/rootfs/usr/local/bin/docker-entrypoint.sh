#!/bin/sh

# --enable-source-maps resolves production stack traces back to original TypeScript source.
NODE_OPTIONS="--no-node-snapshot --enable-source-maps" HOSTNAME=${HOSTNAME:-0.0.0.0} PORT=${PORT:-3000} node apps/mcp-server/dist/index.mjs;
