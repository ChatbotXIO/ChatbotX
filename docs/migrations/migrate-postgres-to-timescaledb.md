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

### 6a. Configure continuous aggregate refresh policies

After migrations run, the three hourly caggs exist but have no auto-refresh policy. Without this step they will only ever contain data from the initial `REFRESH MATERIALIZED VIEW` call and will go stale.

```sql
-- Run inside the chatbotx database
SELECT add_continuous_aggregate_policy(
  'analytics_contact_events_hourly',
  start_offset => INTERVAL '8 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

SELECT add_continuous_aggregate_policy(
  'analytics_message_events_hourly',
  start_offset => INTERVAL '8 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

SELECT add_continuous_aggregate_policy(
  'analytics_bot_message_events_hourly',
  start_offset => INTERVAL '8 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);
```

**Why these intervals?**
- `start_offset = 8 days` keeps the last 8 days materialized. The analytics API only routes to the cagg when `from >= now() - 6 days` (a 6-day threshold with a 1-day safety buffer). Having 8 days of cagg data provides an additional day of headroom.
- `end_offset = 1 hour` avoids materializing the current in-flight hour, which would require a re-materialization on the next refresh.
- `schedule_interval = 1 hour` matches the bucket granularity.

**Backfill existing data** (only needed on a fresh TimescaleDB install with pre-existing rows):

```sql
CALL refresh_continuous_aggregate('analytics_contact_events_hourly',    now() - INTERVAL '8 days', now());
CALL refresh_continuous_aggregate('analytics_message_events_hourly',    now() - INTERVAL '8 days', now());
CALL refresh_continuous_aggregate('analytics_bot_message_events_hourly', now() - INTERVAL '8 days', now());
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
