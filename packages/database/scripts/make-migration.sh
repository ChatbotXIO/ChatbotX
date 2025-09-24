#!/bin/sh

set -e

if [ -z "$1" ]; then
  echo "Error: Migration name argument (\$1) is required."
  exit 1
fi

folder=$(date +%Y%m%d%H%M%S)_$1
mkdir -p "prisma/migrations/$folder"

prisma migrate dev --create-only --name $1/migration.sql