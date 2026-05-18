# Migrate PostgreSQL: pgvector → timescaledb-ha

This guide covers migrating the local Docker development database from `pgvector/pgvector:pg18-trixie` to `timescale/timescaledb-ha:pg18-all`.

## Why a dump/restore is required

A direct volume reuse is not possible for two reasons:

1. **Data directory changed** — pgvector uses `/var/lib/postgresql/data`, timescaledb-ha uses `/home/postgres/pgdata`
2. **Internal catalog format** — TimescaleDB adds its own catalog tables; pg_upgrade-in-place is not supported across these images

## Image comparison

| | pgvector | timescaledb-ha |
|---|---|---|
| Data path | `/var/lib/postgresql/data` | `/home/postgres/pgdata` |
| pgvector included | yes | yes (pg18-all) |
| TimescaleDB | no | yes |
| Runs as user | `postgres` | `postgres` |

## Steps

### 1. Backup (before any change)

```bash
docker compose exec postgres pg_dumpall -U chatbotx > backup_$(date +%Y%m%d_%H%M%S).sql
```

Verify the dump is non-empty:

```bash
wc -l backup_*.sql
```

### 2. Stop and destroy the old volume

```bash
docker compose down
docker volume rm chatbotx_db-data
```

> The volume name is `chatbotx_db-data` because the compose project is named `chatbotx` (set via `name:` in `docker-compose.yml`).

### 3. Start the new container

```bash
docker compose up postgres -d
```

Wait until the health check passes (up to ~30s):

```bash
docker compose ps postgres
```

### 4. Restore data

```bash
docker compose exec -T postgres psql -U chatbotx postgres < backup_*.sql
```

### 5. Enable TimescaleDB extension

```bash
docker compose exec postgres psql -U chatbotx chatbotx \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"
```

`pgvector` is bundled in `pg18-all` and needs no separate action — existing vector columns continue to work.

### 6. Run app migrations

```bash
pnpm --filter @chatbotx.io/database db:migrate
```

### 7. Smoke test

```bash
docker compose exec postgres psql -U chatbotx chatbotx -c "\dx"
```

The output should list both `timescaledb` and `vector`. Then bring the full stack up:

```bash
docker compose up -d
```

## Notes

Keep the backup file until the new stack is fully verified. It is the only recovery path if the restore fails.
