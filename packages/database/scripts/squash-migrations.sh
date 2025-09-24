#!/bin/sh

set -e

if [ -z "$1" ]; then
  echo "Error: Migration name argument (\$1) is required."
  exit 1
fi

folder=$(date +%Y%m%d%H%M%S)_$1
mkdir -p "prisma/migrations/$folder"

prisma migrate diff --from-migrations prisma/migrations --shadow-database-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/$folder/migration.sql
prisma migrate resolve --applied $folder