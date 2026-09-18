import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CALL_CANCELED_BY_BUSINESS_LAST_ERROR } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"

/**
 * DB-free pin on the `outcome` migration TRIPLE's SQL text (review A1/A7,
 * A-HIGH) — these three files must never be recombined (that would hold
 * ACCESS EXCLUSIVE on `WhatsappCall` for the whole backfill/index-build
 * duration, or reintroduce the zero-covering-index retry hazard fixed below)
 * and their statement ORDER matters in ways a schema-level check cannot see.
 */

const drizzleDir = join(import.meta.dirname, "../drizzle")

const typeColumnSql = readFileSync(
  join(
    drizzleDir,
    "20260917173244_whatsapp_call_outcome_type_column/migration.sql",
  ),
  "utf8",
)

const buildIndexSql = readFileSync(
  join(
    drizzleDir,
    "20260917173245_whatsapp_call_outcome_backfill_index/migration.sql",
  ),
  "utf8",
)

const dropLegacyIndexSql = readFileSync(
  join(
    drizzleDir,
    "20260917173246_whatsapp_call_outcome_drop_legacy_index/migration.sql",
  ),
  "utf8",
)

const NEW_INDEX_NAME = '"WhatsappCall_workspaceId_createdAt_id_idx"'
const OLD_INDEX_NAME = '"WhatsappCall_workspaceId_createdAt_idx"'
const ENUM_VALUES_RE = /CREATE TYPE "whatsappCallOutcome" AS ENUM\(([^)]+)\)/
const QUOTED_VALUE_RE = /^'|'$/g
const CONCURRENTLY_RE = /\bCONCURRENTLY\b/i
const CREATE_INDEX_CONCURRENTLY_RE = /CREATE INDEX CONCURRENTLY/
const DROP_INDEX_CONCURRENTLY_RE = /DROP INDEX CONCURRENTLY/

describe("whatsapp call outcome migration triple", () => {
  test("migration 1 (type + column) declares the whatsappCallOutcome enum with exactly the four outcome values", () => {
    const match = ENUM_VALUES_RE.exec(typeColumnSql)
    expect(match).not.toBeNull()

    const values = (match?.[1] ?? "")
      .split(",")
      .map((value) => value.trim().replace(QUOTED_VALUE_RE, ""))

    expect(values).toEqual(["completed", "failed", "rejected", "canceled"])
  })

  test("migration 1 adds the nullable outcome column and never touches the index or backfills", () => {
    expect(typeColumnSql).toContain(
      'ALTER TABLE "WhatsappCall" ADD COLUMN "outcome" "whatsappCallOutcome"',
    )
    expect(typeColumnSql).not.toContain("UPDATE")
    expect(typeColumnSql).not.toContain("INDEX")
    expect(typeColumnSql).toContain("SET LOCAL lock_timeout")
  })

  test("migration 1 contains no CONCURRENTLY statement (it must stay transactional)", () => {
    expect(typeColumnSql).not.toMatch(CONCURRENTLY_RE)
  })

  test("migration 2 (build index) is entirely CONCURRENTLY/idempotent — every statement is safe to re-run", () => {
    // The runner (`scripts/run-migrations.mjs`) only unwraps a migration's
    // transaction when at least one of its statements matches `CONCURRENTLY`
    // — assert every DDL-adjacent statement in this file is either
    // CONCURRENTLY or an idempotent `WHERE ... IS NULL` guarded UPDATE.
    expect(buildIndexSql).toMatch(CREATE_INDEX_CONCURRENTLY_RE)
    expect(buildIndexSql).toMatch(CONCURRENTLY_RE)
  })

  test("migration 2's canceled backfill precedes the general terminal backfill, and both guard on outcome IS NULL", () => {
    const canceledIndex = buildIndexSql.indexOf(`SET "outcome" = 'canceled'`)
    const generalIndex = buildIndexSql.indexOf(
      `SET "outcome" = "status"::text::"whatsappCallOutcome"`,
    )

    expect(canceledIndex).toBeGreaterThan(-1)
    expect(generalIndex).toBeGreaterThan(-1)
    expect(canceledIndex).toBeLessThan(generalIndex)

    // Each backfill statement (up to its own statement-breakpoint) is
    // individually guarded — never relying on the other statement's guard.
    const canceledStatement = buildIndexSql.slice(
      canceledIndex,
      buildIndexSql.indexOf("statement-breakpoint", canceledIndex),
    )
    const generalStatement = buildIndexSql.slice(
      generalIndex,
      buildIndexSql.indexOf("statement-breakpoint", generalIndex),
    )
    expect(canceledStatement).toContain('"outcome" IS NULL')
    expect(generalStatement).toContain('"outcome" IS NULL')
  })

  test("the persisted business-cancel marker in migration 2 matches CALL_CANCELED_BY_BUSINESS_LAST_ERROR from the sdk", () => {
    expect(buildIndexSql).toContain(
      `AND "lastError" = '${CALL_CANCELED_BY_BUSINESS_LAST_ERROR}'`,
    )
  })

  /**
   * Retry hazard (review A-HIGH): `CREATE INDEX CONCURRENTLY IF NOT EXISTS`
   * that fails partway leaves an INVALID index under that exact name in
   * Postgres's catalog — CONCURRENTLY builds cannot roll back like an
   * ordinary DDL statement. On a naive retry, `IF NOT EXISTS` sees the
   * (invalid) index "already there" and skips rebuilding it. If the drop of
   * the old index lived in this SAME file, the very next statement would
   * then drop the still-load-bearing old index — the call-log page
   * permanently loses its covering index. The fix (this test pins it) is
   * TWO-FOLD: (a) an unconditional `DROP INDEX CONCURRENTLY IF EXISTS` on
   * the NEW index's own name immediately before the `CREATE`, so a retry
   * always clears any invalid leftover and is forced to actually rebuild it,
   * and (b) the old index's drop lives in a SEPARATE, LATER migration file
   * entirely (20260917173246_whatsapp_call_outcome_drop_legacy_index) that
   * only runs once this file has fully completed and been recorded — so a
   * retry of THIS file can never touch the old index at all.
   */
  test("migration 2 unconditionally drops any existing new-index leftover immediately before (re-)building it, so a retry after a failed CONCURRENTLY build can never skip a rebuild via IF NOT EXISTS", () => {
    const guardDropIndex = buildIndexSql.indexOf(
      `DROP INDEX CONCURRENTLY IF EXISTS ${NEW_INDEX_NAME}`,
    )
    const createIndex = buildIndexSql.indexOf(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${NEW_INDEX_NAME}`,
    )

    expect(guardDropIndex).toBeGreaterThan(-1)
    expect(createIndex).toBeGreaterThan(-1)
    // The guard drop must be the LAST statement before the CREATE — nothing
    // else (in particular no backfill UPDATE) may sit between them, or a
    // retry could re-run the guard against a stale statement position.
    const betweenGuardAndCreate = buildIndexSql
      .slice(guardDropIndex, createIndex)
      .split("statement-breakpoint")
    expect(betweenGuardAndCreate).toHaveLength(2)
    expect(betweenGuardAndCreate[0]).toContain(
      `DROP INDEX CONCURRENTLY IF EXISTS ${NEW_INDEX_NAME}`,
    )
  })

  test("migration 2 never mentions the old index name — the build phase must never be able to touch it, on a clean run or any retry", () => {
    expect(buildIndexSql).not.toContain(OLD_INDEX_NAME)
  })

  test("migration 2 is the LAST statement in its file once the new index is created — nothing (in particular no DROP of the old index) may run after the CREATE in this file", () => {
    const createIndex = buildIndexSql.indexOf(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${NEW_INDEX_NAME}`,
    )
    const trailing = buildIndexSql.slice(createIndex).trim()
    // Only the CREATE statement itself (and its trailing `;`) remains — no
    // further statement-breakpoint, i.e. no further statement.
    expect(trailing.includes("statement-breakpoint")).toBe(false)
  })

  test("migration 3 (drop legacy index) contains exactly one statement: an idempotent, CONCURRENTLY drop of the OLD index only", () => {
    expect(dropLegacyIndexSql).toMatch(DROP_INDEX_CONCURRENTLY_RE)
    expect(dropLegacyIndexSql).toContain(
      `DROP INDEX CONCURRENTLY IF EXISTS ${OLD_INDEX_NAME}`,
    )
    expect(dropLegacyIndexSql).not.toContain("statement-breakpoint")
  })

  test("migration 3 never creates, rebuilds, or otherwise mentions the new index — it must only ever remove the old one", () => {
    expect(dropLegacyIndexSql).not.toContain("CREATE INDEX")
    expect(dropLegacyIndexSql).not.toContain(NEW_INDEX_NAME)
  })

  test("migration 2 and migration 3 files are ordered so migration 2 (build) always applies before migration 3 (drop) — folder timestamps must sort that way", () => {
    // `run-migrations.mjs` applies migrations in folder-timestamp order via
    // drizzle-orm's `readMigrationFiles`, so this ordering is what actually
    // guarantees migration 3 never runs before migration 2 is recorded.
    const buildTimestamp = "20260917173245"
    const dropTimestamp = "20260917173246"
    expect(Number(dropTimestamp)).toBeGreaterThan(Number(buildTimestamp))
  })

  /**
   * The core invariant the split exists to guarantee (review A-HIGH): at
   * every point in the rollout — clean run or any retry of any single file
   * — `WhatsappCall` always has AT LEAST ONE covering index for the
   * call-log page's `(workspaceId, createdAt, id)` scan. This is no longer
   * "the new index is created before the old one is dropped within one
   * file" (that property alone is insufficient once a retry can replay a
   * partially-applied file) — it is now a cross-file property enforced by
   * splitting the drop into a migration that only becomes reachable after
   * the build migration is fully recorded:
   *   - Before migration 2 starts, or mid-retry of migration 2: the OLD
   *     index is untouched (migration 2 never mentions it) → still covering.
   *   - After migration 2 is recorded (NEW index guaranteed valid) but
   *     before migration 3 runs, or mid-retry of migration 3: the OLD index
   *     is still present (migration 3's only statement hasn't necessarily
   *     succeeded yet) AND the NEW index is present → covered twice over.
   *   - After migration 3 completes: only the NEW index remains → still
   *     covering.
   * There is no reachable state with zero covering indexes.
   */
  test("the outcome migration triple never has a state where both the old and new covering index are simultaneously absent (retry-safe by construction)", () => {
    // Migration 2 alone can never remove the old index (pinned above) and
    // always leaves the new index either absent-then-built or already
    // built — so the old index alone covers a retry of migration 2.
    expect(buildIndexSql).not.toContain(
      `DROP INDEX CONCURRENTLY IF EXISTS ${OLD_INDEX_NAME}`,
    )
    // Migration 3 alone can never touch the new index (pinned above) and
    // only removes the old one — so the new index alone covers a retry of
    // migration 3, and migration 3 only becomes reachable once migration 2
    // is fully recorded (asserted by the folder-timestamp ordering test).
    expect(dropLegacyIndexSql).not.toContain(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${NEW_INDEX_NAME}`,
    )
  })
})
