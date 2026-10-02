// @vitest-environment node

/**
 * `scripts/backfill-connections.ts` end-to-end against a real Postgres,
 * run exactly as an operator would (`tsx scripts/backfill-connections.ts`)
 * rather than importing its internals — the script executes `main()` at
 * module scope and calls `process.exit`, so it is not safely importable.
 *
 * Proves the idempotency fix: a Connection row the backfill already created
 * must survive a second run unchanged, even after the live FSM has moved it
 * to a status (`needs_reauth`) the backfill's own
 * `resolveChannelStatus`/`resolveWorkspaceStatus` never produce.
 *
 * Fixtures are committed (not run inside an uncommitted transaction) since
 * the script runs in its own process/connection and must see them — cleaned
 * up explicitly in `afterAll` instead of relying on rollback. Inserted via
 * drizzle (not raw SQL) so every NOT-NULL-with-no-database-default column
 * (several `jsonb` columns here — the same class of gotcha
 * `insert-required-columns.test.ts` exists for) is supplied automatically.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { relations } from "../../src/relations"
// biome-ignore lint/performance/noNamespaceImport: mirrors how src/client.ts builds the db
import * as schema from "../../src/schema"
import {
  connectionModel,
  inboxModel,
  integrationMessengerModel,
  userModel,
  workspaceModel,
} from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const execFileAsync = promisify(execFile)

const runBackfillScript = async (): Promise<{
  stdout: string
  exitCode: number
}> => {
  try {
    const { stdout } = await execFileAsync(
      "npx",
      ["tsx", "scripts/backfill-connections.ts"],
      {
        cwd: new URL("../..", import.meta.url).pathname,
        env: { ...process.env, DATABASE_URL: databaseUrl as string },
      },
    )
    return { stdout, exitCode: 0 }
  } catch (error) {
    const execError = error as { stdout?: string; code?: number }
    return { stdout: execError.stdout ?? "", exitCode: execError.code ?? 1 }
  }
}

describe.skipIf(!databaseUrl)(
  "scripts/backfill-connections.ts against Postgres",
  () => {
    let client: Client
    let db: ReturnType<typeof drizzle>
    let workspaceId: string
    let ownerId: string
    let inboxId: string

    beforeAll(async () => {
      client = new Client({ connectionString: databaseUrl as string })
      await client.connect()
      db = drizzle({ client, schema, relations })

      const [owner] = await db
        .insert(userModel)
        .values({ email: `backfill-test-${Date.now()}@example.test` })
        .returning({ id: userModel.id })
      ownerId = owner.id

      const [workspace] = await db
        .insert(workspaceModel)
        .values({ name: "backfill-test-ws", ownerId })
        .returning({ id: workspaceModel.id })
      workspaceId = workspace.id

      const [inbox] = await db
        .insert(inboxModel)
        .values({
          name: "Backfill Test Page",
          channel: "messenger",
          sourceId: "backfill-page-1",
          workspaceId,
        })
        .returning({ id: inboxModel.id })
      inboxId = inbox.id

      // `conversationStarters`/`persistentMenus`/`personas` are
      // `.default(sql\`[]\`)` in the drizzle schema, but drizzle-kit drops
      // a `sql` default for a jsonb column when it serializes the
      // migration snapshot (see `insert-required-columns.test.ts`) — the
      // physical columns are NOT NULL with no database default, so they
      // must be supplied explicitly here too.
      await db.insert(integrationMessengerModel).values({
        auth: { authType: "none" },
        name: "Backfill Test Page",
        pageId: "backfill-page-1",
        workspaceId,
        inboxId,
        conversationStarters: [],
        persistentMenus: [],
        personas: [],
      })
    })

    afterAll(async () => {
      await db
        .delete(connectionModel)
        .where(eq(connectionModel.workspaceId, workspaceId))
      await db
        .delete(integrationMessengerModel)
        .where(eq(integrationMessengerModel.inboxId, inboxId))
      await db.delete(inboxModel).where(eq(inboxModel.id, inboxId))
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, ownerId))
      await client.end()
    })

    test("first run inserts a Connection row from the Inbox/IntegrationMessenger fixture", async () => {
      const { exitCode } = await runBackfillScript()
      expect(exitCode).toBe(0)

      const [row] = await db
        .select({
          status: connectionModel.status,
          inboxId: connectionModel.inboxId,
        })
        .from(connectionModel)
        .where(eq(connectionModel.workspaceId, workspaceId))
      expect(row).toMatchObject({ status: "connected", inboxId })
    }, 30_000)

    test("re-running after the live FSM moved the connection to needs_reauth does not revert it (regression: item 14 — the old ON CONFLICT DO UPDATE overwrote live FSM state on every re-run)", async () => {
      await db
        .update(connectionModel)
        .set({ status: "needs_reauth" })
        .where(eq(connectionModel.workspaceId, workspaceId))

      const { exitCode } = await runBackfillScript()
      expect(exitCode).toBe(0)

      const rows = await db
        .select({ status: connectionModel.status })
        .from(connectionModel)
        .where(eq(connectionModel.workspaceId, workspaceId))
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe("needs_reauth")
    }, 30_000)
  },
)
