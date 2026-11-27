import { type DatabaseClient, db, sql } from "../../client"
import type { CacheVersionNamespace } from "../../partials/cache-version"
import { cacheVersionModel } from "../../schema/cache-version"

export type CacheVersionReadInput = {
  namespace: CacheVersionNamespace
  scopeId: string
  /**
   * A full `ILIKE` pattern (for example `likeContains(keyword)`), lowered with
   * the database default collation, which is the one `ILIKE` applies to it.
   */
  lowercase?: string
}

export type CacheVersionKey = {
  namespace: CacheVersionNamespace
  scopeId: string
}

export type CacheVersionRead = {
  /** Canonical decimal bigint; `"0"` when the scope has no row yet. */
  version: string
  /**
   * `statement_timestamp()` as integral epoch microseconds (decimal string,
   * exact for `timestamptz(6)`). Outside a transaction block it equals `now()`;
   * as the first statement of a transaction it marks the snapshot instant, not
   * the earlier `BEGIN` that `now()` would report.
   */
  databaseNowMicros: string
  /** `lower(lowercase)`, or `null` when no pattern was given. */
  lowercased: string | null
}

type CacheVersionReadRow = {
  version: string
  databaseNowMicros: string
  lowercased: string | null
}

export const cacheVersionRepository = {
  /**
   * The change counter of one scope, the database clock and optionally the
   * lowered pattern, in one round trip. Always returns exactly one row: the
   * `CacheVersion` row is left-joined onto a one-row relation, so a scope that
   * was never written reads version `0`.
   */
  async read(
    input: CacheVersionReadInput,
    tx: DatabaseClient = db,
  ): Promise<CacheVersionRead> {
    const result = await tx.execute<CacheVersionReadRow>(sql`
      SELECT
        coalesce(cv."version", 0)::text AS "version",
        floor(extract(epoch FROM statement_timestamp()) * 1000000)::bigint::text AS "databaseNowMicros",
        lower(${input.lowercase ?? null}::text) AS "lowercased"
      FROM (SELECT 1) AS one
      LEFT JOIN "CacheVersion" cv
        ON cv."namespace" = ${input.namespace}
       AND cv."scopeId" = ${input.scopeId}
    `)
    const [row] = result.rows
    if (!row) {
      throw new Error("CacheVersion read returned no row")
    }
    return {
      version: row.version,
      databaseNowMicros: row.databaseNowMicros,
      lowercased: row.lowercased,
    }
  },
  /**
   * Advances the change counter of one scope (creating it at 1). `tx` is
   * required: the bump must commit or roll back with the write it announces,
   * and the caller bumps AFTER its domain writes so this row lock is the last
   * one it takes. The increment runs under the row lock, so concurrent bumps
   * never lose one and versions rise in commit order.
   */
  async bump(key: CacheVersionKey, tx: DatabaseClient): Promise<void> {
    await tx
      .insert(cacheVersionModel)
      .values({ namespace: key.namespace, scopeId: key.scopeId, version: "1" })
      .onConflictDoUpdate({
        target: [cacheVersionModel.namespace, cacheVersionModel.scopeId],
        set: {
          version: sql`${cacheVersionModel.version} + 1`,
          updatedAt: sql`statement_timestamp()`,
        },
      })
  },
}
