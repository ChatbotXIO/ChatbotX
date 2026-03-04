#!/bin/sh

set -e

if [ -z "$1" ]; then
  echo "Error: Migration name argument (\$1) is required."
  exit 1
fi

drizzle-kit generate --name=$1
