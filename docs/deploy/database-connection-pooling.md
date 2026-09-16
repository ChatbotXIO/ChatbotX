# Database connection pooling

For production, place PgBouncer in transaction-pooling mode in front of the application pool so each application process can retain its bounded local pool without exhausting PostgreSQL connections; this is compatible with the transaction-scoped `SET LOCAL` usage documented in `packages/database/src/timescale.ts` (lines 14–16), which resets on commit.
