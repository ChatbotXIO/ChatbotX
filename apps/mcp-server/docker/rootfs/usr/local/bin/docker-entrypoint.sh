#!/bin/sh

NODE_OPTIONS=--no-node-snapshot HOSTNAME=${HOSTNAME:-0.0.0.0} PORT=${PORT:-3000} node apps/mcp-server/dist/index.mjs;
