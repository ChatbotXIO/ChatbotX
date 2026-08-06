import { sql } from "drizzle-orm"
import type { DatabaseClient } from "./client"

/**
 * Lift TimescaleDB's per-transaction decompression cap for the current
 * transaction so a bulk DELETE against a compressed hypertable
 * (`Message`/`Attachment`) is not aborted by
 * `max_tuples_decompressed_per_dml_transaction` (default 100k; `0` = unlimited).
 *
 * The GUC name is exact per TimescaleDB's `src/guc.c`
 * (`MAKE_EXTOPTION("max_tuples_decompressed_per_dml_transaction")`); an unknown
 * `timescaledb.*` name would raise "unrecognized configuration parameter".
 *
 * MUST be called inside the same transaction as the delete: `SET LOCAL` scopes
 * the change to that transaction and reverts on commit, which is also what keeps
 * it safe under PgBouncer transaction pooling.
 */
export const liftDecompressionLimit = async (
  tx: DatabaseClient,
): Promise<void> => {
  await tx.execute(
    sql`SET LOCAL timescaledb.max_tuples_decompressed_per_dml_transaction = 0`,
  )
}
