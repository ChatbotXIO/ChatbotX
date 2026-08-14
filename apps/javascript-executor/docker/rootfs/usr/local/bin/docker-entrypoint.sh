#!/bin/sh

set -eu

# isolated-vm requires snapshots to be disabled. Source maps keep production
# stack traces tied to the original TypeScript source.
export NODE_OPTIONS="${NODE_OPTIONS:-} --no-node-snapshot --enable-source-maps"

exec node apps/javascript-executor/dist/index.mjs
