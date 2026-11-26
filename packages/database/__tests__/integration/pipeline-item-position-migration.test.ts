// @vitest-environment node

/**
 * Migration `pipeline_item_position_backfill_and_index` against real Postgres,
 * in a THROWAWAY database (never the dev database): the full migration chain is
 * applied through the real runner (`scripts/run-migrations.mjs`), rows are
 * seeded, and the backfill migration is re-applied through the same runner
 * (its record deleted) so the unwrapped, per-statement execution is the real one.
 *
 * Asserts the batched backfill commits per batch (a top-level `DO` block with
 * `COMMIT` works over node-postgres; rows end up stamped by several
 * transactions), reproduces the `createdAt DESC` board order, is re-runnable
 * (also after a failed index build) without rewriting rows, and ends with a
 * validated CHECK and a valid index.
 *
 * Needs a SUPERUSER role that may `CREATE DATABASE` (the seed disables FK
 * triggers with `session_replication_role`, and the chain creates extensions).
 * Skipped unless `DATABASE_URL` points at a reachable server, and skipped
 * cleanly when the role is not a superuser; run with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { realDatabaseUrl } from "./database-url"

const execFileAsync = promisify(execFile)
const databaseUrl = realDatabaseUrl()

const packageRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)
const BACKFILL_MIGRATION_NAME_PATTERN =
  "%_pipeline_item_position_backfill_and_index"
const SEEDED_ITEMS = 12_000
// Rows per committed batch in the migration.
const BACKFILL_BATCH_SIZE = 5000
const MIGRATE_TIMEOUT_MS = 180_000
const POSITION_INDEX = "PipelineItem_stage_position_idx"
const POSITION_CHECK = "PipelineItem_position_finite_check"

const scratchDatabaseName = `pipeline_position_migration_${process.pid}`

function urlForDatabase(name: string): string {
  const url = new URL(databaseUrl as string)
  url.pathname = `/${name}`
  return url.toString()
}

describe.skipIf(!databaseUrl)(
  "pipeline item position backfill migration",
  () => {
    let admin: Client
    let client: Client
    let canRun = false

    const runMigrations = async (): Promise<void> => {
      await execFileAsync(
        process.execPath,
        [path.join(packageRoot, "scripts", "run-migrations.mjs")],
        {
          cwd: packageRoot,
          env: {
            ...process.env,
            DATABASE_URL: urlForDatabase(scratchDatabaseName),
          },
        },
      )
    }

    // Forget that the backfill migration ran so the runner applies it again.
    const rerunBackfillMigration = async (): Promise<void> => {
      await client.query(
        `DELETE FROM drizzle."__drizzle_migrations" WHERE name LIKE $1`,
        [BACKFILL_MIGRATION_NAME_PATTERN],
      )
      await runMigrations()
    }

    const distinctRowTransactions = async (): Promise<number> => {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(DISTINCT xmin::text)::text AS n FROM "PipelineItem"`,
      )
      return Number(rows[0]?.n)
    }

    const newestRowTransaction = async (): Promise<number> => {
      const { rows } = await client.query<{ newest: string }>(
        `SELECT max(xmin::text::bigint)::text AS newest FROM "PipelineItem"`,
      )
      return Number(rows[0]?.newest)
    }

    beforeAll(async () => {
      admin = new Client({ connectionString: databaseUrl as string })
      await admin.connect()
      const { rows } = await admin.query<{ rolsuper: boolean }>(
        "SELECT rolsuper FROM pg_roles WHERE rolname = current_user",
      )
      canRun = rows[0]?.rolsuper === true
      if (!canRun) {
        return
      }

      await admin.query(`CREATE DATABASE "${scratchDatabaseName}"`)
      await runMigrations()

      client = new Client({
        connectionString: urlForDatabase(scratchDatabaseName),
      })
      await client.connect()
      // Raw seed rows reference nothing real; skip FK triggers for this session.
      await client.query("SET session_replication_role = replica")
      await client.query(
        `INSERT INTO "PipelineItem"
         (id, "createdAt", "updatedAt", "workspaceId", "pipelineId", "stageId",
          "contactId", number, title, status, priority, "fieldValues", "stageEnteredAt")
       SELECT g, now() - (g * interval '1 second'), now(), 1, 1, 1, 1, g, 'item',
              'open', 'medium', '{}', now()
         FROM generate_series(1, ${SEEDED_ITEMS}) g`,
      )
      await client.query("SET session_replication_role = origin")
    }, MIGRATE_TIMEOUT_MS)

    afterAll(async () => {
      await client?.end()
      await admin?.query(
        `DROP DATABASE IF EXISTS "${scratchDatabaseName}" WITH (FORCE)`,
      )
      await admin?.end()
    })

    test("rows written without a position get the same default (newest on top)", async (ctx) => {
      if (!canRun) {
        ctx.skip()
      }
      const { rows } = await client.query<{ distinct_positions: string }>(
        `SELECT count(DISTINCT position)::text AS distinct_positions FROM "PipelineItem"`,
      )
      // Every seeded row took the one transaction-time default before backfill.
      expect(Number(rows[0]?.distinct_positions)).toBe(1)
    })

    test("backfills createdAt DESC order, committing per batch", async (ctx) => {
      if (!canRun) {
        ctx.skip()
      }
      expect(await distinctRowTransactions()).toBe(1)

      await rerunBackfillMigration()

      // Every committed batch stamps its rows with its own transaction; a
      // single-transaction backfill would leave exactly one.
      expect(await distinctRowTransactions()).toBeGreaterThanOrEqual(
        Math.ceil(SEEDED_ITEMS / BACKFILL_BATCH_SIZE),
      )

      const { rows } = await client.query<{ violations: string }>(
        `SELECT count(*)::text AS violations FROM (
         SELECT position, lead(position) OVER (ORDER BY "createdAt" DESC, id) AS next_position
           FROM "PipelineItem"
       ) ordered
       WHERE next_position IS NOT NULL AND next_position <= position`,
      )
      expect(Number(rows[0]?.violations)).toBe(0)
    })

    test("ends with a validated check and a valid index", async (ctx) => {
      if (!canRun) {
        ctx.skip()
      }
      const check = await client.query<{ convalidated: boolean }>(
        "SELECT convalidated FROM pg_constraint WHERE conname = $1",
        [POSITION_CHECK],
      )
      expect(check.rows[0]?.convalidated).toBe(true)

      const index = await client.query<{ indisvalid: boolean }>(
        "SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass($1)",
        [`"${POSITION_INDEX}"`],
      )
      expect(index.rows[0]?.indisvalid).toBe(true)
    })

    test("re-runs after an interrupted first run without rewriting rows", async (ctx) => {
      if (!canRun) {
        ctx.skip()
      }
      // A failed CONCURRENTLY build leaves an INVALID index behind: replace the
      // real index with a unique build that must fail on the seeded duplicates.
      await client.query(`DROP INDEX "${POSITION_INDEX}"`)
      await expect(
        client.query(
          `CREATE UNIQUE INDEX CONCURRENTLY "${POSITION_INDEX}" ON "PipelineItem" ("stageId")`,
        ),
      ).rejects.toThrow()
      const invalid = await client.query<{ indisvalid: boolean }>(
        "SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass($1)",
        [`"${POSITION_INDEX}"`],
      )
      expect(invalid.rows[0]?.indisvalid).toBe(false)

      const newestBefore = await newestRowTransaction()
      await rerunBackfillMigration()

      const rebuilt = await client.query<{
        indisvalid: boolean
        definition: string
      }>(
        `SELECT indisvalid, pg_get_indexdef(indexrelid) AS definition
         FROM pg_index WHERE indexrelid = to_regclass($1)`,
        [`"${POSITION_INDEX}"`],
      )
      expect(rebuilt.rows[0]?.indisvalid).toBe(true)
      expect(rebuilt.rows[0]?.definition).toContain(
        '("pipelineId", "stageId", "position", id)',
      )

      // Rows already at their backfilled position are not rewritten.
      expect(await newestRowTransaction()).toBe(newestBefore)
      const { rows } = await client.query<{ distinct_positions: string }>(
        `SELECT count(DISTINCT position)::text AS distinct_positions FROM "PipelineItem"`,
      )
      expect(Number(rows[0]?.distinct_positions)).toBe(SEEDED_ITEMS)
    })
  },
)
