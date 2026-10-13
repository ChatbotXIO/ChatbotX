// @vitest-environment node

/**
 * The constraints that make a repeating broadcast safe, against a real
 * Postgres: the unique `(parentBroadcastId, occurrenceAt)` that stops a second
 * run for a slot, the CHECK that keeps a run recognisable once its parent is
 * purged, and the ledger's unique `(recurrenceId, localSlot, occurrenceAt)`.
 *
 * Everything runs in one transaction that is always rolled back, against the
 * first workspace in the database, so no row survives.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/database test:db`.
 */

import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const SCHEMA_QUERY_PARAM = /\?schema=.*$/

const PARENT_ID = "990000000000001"
const OTHER_PARENT_ID = "990000000000002"
const RECURRENCE_ID = "990000000000011"
const SLOT = "2026-10-15T02:00:00.000Z"

describe.skipIf(!databaseUrl)("repeating broadcast constraints", () => {
  let client: Client
  let workspaceId: string | null = null
  let nextId = 990_000_000_001_000

  const insertBroadcast = (
    id: string,
    extra: { parent?: string | null; occurrenceAt?: string | null } = {},
  ) =>
    client.query(
      `INSERT INTO "Broadcast"
         (id, name, "workspaceId", status, "schedulesType", "schedulesAt",
          subaction, channel, "parentBroadcastId", "occurrenceAt")
       VALUES ($1, $2, $3, 'scheduled', 'future', now(), 'allContacts',
          'omnichannel', $4, $5)`,
      [
        id,
        `b-${id}`,
        workspaceId,
        extra.parent ?? null,
        extra.occurrenceAt ?? null,
      ],
    )

  const insertLedgerRow = (localSlot: string, occurrenceAt = SLOT) => {
    nextId += 1
    return client.query(
      `INSERT INTO "BroadcastRecurrenceOccurrence"
         (id, "workspaceId", "recurrenceId", "localSlot", "occurrenceAt",
          outcome, "materializedAt")
       VALUES ($1, $2, $3, $4, $5, 'skipped', now())`,
      [String(nextId), workspaceId, RECURRENCE_ID, localSlot, occurrenceAt],
    )
  }

  /** Runs a statement expected to fail without poisoning the transaction. */
  const rejects = async (statement: () => Promise<unknown>) => {
    await client.query("SAVEPOINT attempt")
    try {
      await statement()
      return null
    } catch (error) {
      return error as { code?: string; constraint?: string }
    } finally {
      await client.query("ROLLBACK TO SAVEPOINT attempt")
    }
  }

  beforeAll(async () => {
    client = new Client({
      connectionString: databaseUrl?.replace(SCHEMA_QUERY_PARAM, ""),
    })
    await client.connect()
    await client.query("BEGIN")
    const workspace = await client.query(`SELECT id FROM "Workspace" LIMIT 1`)
    workspaceId = workspace.rows[0]?.id ?? null
    if (!workspaceId) {
      return
    }
    await insertBroadcast(PARENT_ID)
    await insertBroadcast(OTHER_PARENT_ID)
    await client.query(
      `INSERT INTO "BroadcastRecurrence"
         (id, "workspaceId", "broadcastId", rule)
       VALUES ($1, $2, $3, '{}'::jsonb)`,
      [RECURRENCE_ID, workspaceId, PARENT_ID],
    )
  })

  afterAll(async () => {
    await client.query("ROLLBACK")
    await client.end()
  })

  test("a run needs the slot it was created for", async () => {
    if (!workspaceId) {
      return
    }
    const error = await rejects(() =>
      insertBroadcast("990000000000101", { parent: PARENT_ID }),
    )
    expect(error?.code).toBe("23514")
    expect(error?.constraint).toBe("Broadcast_occurrence_pair_check")
  })

  test("a one-off, and a run whose parent was purged, both pass the check", async () => {
    if (!workspaceId) {
      return
    }
    await insertBroadcast("990000000000102")
    await insertBroadcast("990000000000103", { occurrenceAt: SLOT })
  })

  test("a slot gets one run: the same parent and instant is rejected", async () => {
    if (!workspaceId) {
      return
    }
    await insertBroadcast("990000000000104", {
      parent: PARENT_ID,
      occurrenceAt: SLOT,
    })

    const error = await rejects(() =>
      insertBroadcast("990000000000105", {
        parent: PARENT_ID,
        occurrenceAt: SLOT,
      }),
    )
    expect(error?.code).toBe("23505")
    expect(error?.constraint).toBe(
      "Broadcast_parentBroadcastId_occurrenceAt_key",
    )
  })

  test("another series may run at the same instant", async () => {
    if (!workspaceId) {
      return
    }
    await insertBroadcast("990000000000106", {
      parent: OTHER_PARENT_ID,
      occurrenceAt: SLOT,
    })
  })

  test("purging the parent keeps the run, still marked as one", async () => {
    if (!workspaceId) {
      return
    }
    await insertBroadcast("990000000000107", {
      parent: OTHER_PARENT_ID,
      occurrenceAt: "2026-10-16T02:00:00.000Z",
    })

    await client.query(`DELETE FROM "Broadcast" WHERE id = $1`, [
      OTHER_PARENT_ID,
    ])

    const { rows } = await client.query(
      `SELECT "parentBroadcastId", "occurrenceAt" FROM "Broadcast" WHERE id = $1`,
      ["990000000000107"],
    )
    expect(rows[0].parentBroadcastId).toBeNull()
    expect(rows[0].occurrenceAt).not.toBeNull()
  })

  test("the ledger holds one row per logical slot", async () => {
    if (!workspaceId) {
      return
    }
    await insertLedgerRow("2026-10-15 09:00")

    const error = await rejects(() => insertLedgerRow("2026-10-15 09:00"))
    expect(error?.code).toBe("23505")

    await insertLedgerRow("2026-10-16 09:00")
  })

  test("the same wall-clock text at another instant is a different slot (a timezone edit)", async () => {
    if (!workspaceId) {
      return
    }
    await insertLedgerRow("2026-10-17 09:00")

    // Same text, now in another zone: a different instant must still be recorded.
    await insertLedgerRow("2026-10-17 09:00", "2026-10-17T13:00:00.000Z")

    const error = await rejects(() =>
      insertLedgerRow("2026-10-17 09:00", "2026-10-17T13:00:00.000Z"),
    )
    expect(error?.code).toBe("23505")
  })
})
