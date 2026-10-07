// @vitest-environment node

/**
 * `InboxService.disconnect` previously scoped its `UPDATE "Inbox"` by
 * `id` alone. A caller that resolved `workspaceId` from the wrong tenant
 * (e.g. a mixed-up request context) could therefore disconnect another
 * workspace's inbox. This asserts the `WHERE` clause is also scoped by
 * `workspaceId`, so a cross-tenant attempt is a no-op against someone
 * else's row, while a same-tenant call still disconnects it.
 */

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, eq } from "@chatbotx.io/database/client"
import {
  inboxModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { describe, expect, test, vi } from "vitest"

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const databaseUrl = realDatabaseUrl()

vi.mock("../../src/quota-enforcement/service", () => ({
  quotaEnforcementService: { release: vi.fn().mockResolvedValue(undefined) },
}))
vi.mock("../../src/workspace-usage/service", () => ({
  workspaceUsageService: { decrement: vi.fn().mockResolvedValue(undefined) },
}))

// Dynamic: `vi.mock` above is hoisted above static imports, so the module
// under test must be imported afterward to pick up the mocked dependencies.
const { inboxService } = await import("../../src/inbox/service")

/** Thrown at the end of a fixture transaction so it never commits. */
class RollbackSignal extends Error {}

const withRolledBackTransaction = async (
  fn: (tx: DatabaseClient) => Promise<void>,
): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      await fn(tx)
      throw new RollbackSignal()
    })
  } catch (error) {
    if (!(error instanceof RollbackSignal)) {
      throw error
    }
  }
}

const seedWorkspace = async (
  tx: DatabaseClient,
): Promise<{ ownerId: string; workspaceId: string }> => {
  const ownerId = createId()
  const workspaceId = createId()
  await tx.insert(userModel).values({
    id: ownerId,
    email: `inbox-disconnect-${ownerId}@example.test`,
    name: "Inbox disconnect test owner",
  })
  await tx.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Inbox disconnect test workspace",
  })
  return { ownerId, workspaceId }
}

const seedInbox = async (
  tx: DatabaseClient,
  workspaceId: string,
): Promise<string> => {
  const id = createId()
  await tx.insert(inboxModel).values({
    id,
    name: "Test inbox",
    channel: "messenger",
    sourceId: createId(),
    workspaceId,
    status: "connected",
  })
  return id
}

/** Reads the inbox row back by its own PK for assertions. */
const loadInbox = async (tx: DatabaseClient, id: string) => {
  const [row] = await tx
    .select()
    .from(inboxModel)
    .where(eq(inboxModel.id, id))
    .limit(1)
  if (!row) {
    throw new Error("Inbox row was not found")
  }
  return row
}

describe.skipIf(!databaseUrl)(
  "InboxService.disconnect tenancy scoping against Postgres",
  () => {
    test("a cross-tenant disconnect attempt does not affect another workspace's inbox", async () => {
      await withRolledBackTransaction(async (tx) => {
        const owner = await seedWorkspace(tx)
        const attacker = await seedWorkspace(tx)
        const inboxId = await seedInbox(tx, owner.workspaceId)

        await inboxService.disconnect({
          inboxId,
          ownerId: owner.ownerId,
          workspaceId: attacker.workspaceId,
          reason: "manual",
          tx,
        })

        const row = await loadInbox(tx, inboxId)
        expect(row.status).toBe("connected")
        expect(row.disconnectedAt).toBeNull()
        expect(row.disconnectReason).toBeNull()
      })
    })

    test("a same-tenant disconnect does disconnect the inbox", async () => {
      await withRolledBackTransaction(async (tx) => {
        const owner = await seedWorkspace(tx)
        const inboxId = await seedInbox(tx, owner.workspaceId)

        await inboxService.disconnect({
          inboxId,
          ownerId: owner.ownerId,
          workspaceId: owner.workspaceId,
          reason: "manual",
          tx,
        })

        const row = await loadInbox(tx, inboxId)
        expect(row.status).toBe("disconnected")
        expect(row.disconnectReason).toBe("manual")
      })
    })
  },
)
