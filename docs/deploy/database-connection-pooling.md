# Database connection pooling

For production, place PgBouncer in transaction-pooling mode in front of the application pool so each application process can retain its bounded local pool without exhausting PostgreSQL connections; this is compatible with the transaction-scoped `SET LOCAL` usage inside `liftDecompressionLimit` (`packages/database/src/timescale.ts`), which resets on commit.

## Statement timeouts are opt-in

`DATABASE_STATEMENT_TIMEOUT_MS` and `DATABASE_IDLE_IN_TRANSACTION_TIMEOUT_MS` (`packages/database/src/keys.ts`) are both unset by default, so `pg` applies no pool-wide cap — matching today's behavior. Setting either applies it to *every* query on the pool, including long-running jobs such as `liftDecompressionLimit`'s chunk deletes and purge/backfill jobs, which would be cut off mid-run.

Prefer `setLocalStatementTimeout` (`packages/database/src/statement-timeout.ts`) to cap statement duration for a single transaction instead: it applies `SET LOCAL statement_timeout` scoped to that transaction, which resets on commit and never affects other callers sharing the pool.
