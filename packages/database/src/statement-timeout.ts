import { type SQL, sql } from "drizzle-orm"

/**
 * The one capability this helper needs from `db` or a transaction. Declared
 * structurally so this module never imports `./client` (no import cycle, and
 * it stays importable without booting the connection pool).
 */
type StatementExecutor = { execute: (query: SQL) => PromiseLike<unknown> }

/**
 * A PostgreSQL duration literal accepted by `statement_timeout`. Restricting
 * the type to `<number><unit>` is what makes splicing it into the statement
 * below injection-safe: the value can only ever be numeric characters plus a
 * fixed unit, never arbitrary text.
 */
export type StatementTimeout = `${number}ms` | `${number}s`

/**
 * Runtime twin of {@link StatementTimeout}: the type is erased at runtime, so
 * a caller crossing the boundary with a cast or from JavaScript is still held
 * to a whole number plus unit before anything reaches `sql.raw`.
 */
const STATEMENT_TIMEOUT_LITERAL = /^\d+(?:ms|s)$/

/**
 * Cap every statement of the current transaction at `timeout`.
 *
 * Postgres measures `statement_timeout` from the moment a command arrives at
 * the server until it completes, so it also bounds time spent waiting on a
 * row or table lock (the docs note a `lock_timeout` of the same value is
 * redundant). Use it inside a transaction that runs while an external lock
 * (e.g. `distributedLock.runExclusive`) is held, so a statement blocked in
 * Postgres cannot keep that lock alive indefinitely.
 *
 * `SET` accepts no bind parameters, hence `sql.raw` on the typed literal.
 * MUST be called inside a transaction: `SET LOCAL` scopes the change to that
 * transaction and reverts on commit or rollback, which is also what keeps it
 * safe under PgBouncer transaction pooling.
 */
export const setLocalStatementTimeout = async (
  tx: StatementExecutor,
  timeout: StatementTimeout,
): Promise<void> => {
  if (!STATEMENT_TIMEOUT_LITERAL.test(timeout)) {
    throw new RangeError(
      `statement_timeout must be a whole number of ms or s, got ${JSON.stringify(timeout)}`,
    )
  }
  await tx.execute(
    sql`SET LOCAL statement_timeout = ${sql.raw(`'${timeout}'`)}`,
  )
}
