#!/bin/sh

if [ -z "$1" ]; then
  echo "Error: Migration name argument (\$1) is required."
  exit 1
fi

mkdir -p "prisma/migrations/$1"

prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/$1/migration.sql