// @vitest-environment node

/**
 * `InboxService.create`'s revive branch (an existing `disconnected` Inbox
 * row for the same `(workspaceId, channel, sourceId)`) used to flip the row
 * back to `connected` WITHOUT ever calling `quotaEnforcementService
 * .tryConsume` / `workspaceUsageService.increment` — unlike the fresh-insert
 * branch right below it, which gates and credits the `channels` quota unit
 * every time. A caller reconnecting a previously-disconnected channel (the
 * common case for every channel service's `connect()`, since `create` is
 * always invoked with `skipQuota: false` unless the caller owns its own
 * quota edge — see `create`'s doc comment) therefore got a channel back for
 * free: no quota check, no usage credit. This asserts the revive branch now
 * consumes/credits exactly like a fresh insert, respects `skipQuota` the
 * same way, and still performs the real `UPDATE` against Postgres.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import type { DatabaseClient } from "@chatbotx.io/database/client"
import { db, eq } from "@chatbotx.io/database/client"
import {
  inboxModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { describe, expect, type MockInstance, test, vi } from "vitest"

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
  quotaEnforcementService: { tryConsume: vi.fn() },
}))
vi.mock("../../src/workspace-usage/service", () => ({
  workspaceUsageService: { increment: vi.fn(async () => undefined) },
}))

// Dynamic: `vi.mock` above is hoisted above static imports, so the module
// under test must be imported afterward to pick up the mocked dependencies.
const { inboxService } = await import("../../src/inbox/service")
const { quotaEnforcementService } = await import(
  "../../src/quota-enforcement/service"
)
const { workspaceUsageService } = await import(
  "../../src/workspace-usage/service"
)
const mockTryConsume = quotaEnforcementService.tryConsume as MockInstance
const mockIncrement = workspaceUsageService.increment as MockInstance

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
    email: `inbox-create-revive-${ownerId}@example.test`,
    name: "Inbox create revive test owner",
  })
  await tx.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Inbox create revive test workspace",
  })
  return { ownerId, workspaceId }
}

const seedDisconnectedInbox = async (
  tx: DatabaseClient,
  workspaceId: string,
): Promise<{ id: string; sourceId: string }> => {
  const id = createId()
  const sourceId = createId()
  await tx.insert(inboxModel).values({
    id,
    name: "Old name",
    channel: "whatsapp",
    sourceId,
    workspaceId,
    status: "disconnected",
    disconnectedAt: new Date(),
    disconnectReason: "manual",
  })
  return { id, sourceId }
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
  "InboxService.create revive-quota consumption against Postgres",
  () => {
    test("reviving a disconnected inbox consumes the owner's channels quota and credits workspace usage", async () => {
      mockTryConsume.mockResolvedValue({ ok: true })

      await withRolledBackTransaction(async (tx) => {
        const { ownerId, workspaceId } = await seedWorkspace(tx)
        const { id, sourceId } = await seedDisconnectedInbox(tx, workspaceId)

        const result = await inboxService.create({
          tx,
          ownerId,
          data: {
            workspaceId,
            channel: "whatsapp",
            sourceId,
            name: "Revived name",
          } as never,
        })

        expect(mockTryConsume).toHaveBeenCalledWith({
          userId: ownerId,
          metric: "channels",
        })
        expect(mockIncrement).toHaveBeenCalledWith(workspaceId, "channels")
        expect(result.wasCreated).toBe(true)

        const row = await loadInbox(tx, id)
        expect(row.status).toBe("connected")
        expect(row.name).toBe("Revived name")
        expect(row.disconnectedAt).toBeNull()
        expect(row.disconnectReason).toBeNull()
      })
    })

    test("a reconnect blocked by an exhausted quota throws and leaves the inbox disconnected", async () => {
      mockTryConsume.mockResolvedValue({ ok: false })

      await withRolledBackTransaction(async (tx) => {
        const { ownerId, workspaceId } = await seedWorkspace(tx)
        const { id, sourceId } = await seedDisconnectedInbox(tx, workspaceId)

        await expect(
          inboxService.create({
            tx,
            ownerId,
            data: {
              workspaceId,
              channel: "whatsapp",
              sourceId,
              name: "Revived name",
            } as never,
          }),
        ).rejects.toMatchObject({ code: "channelLimitReached" })

        expect(mockIncrement).not.toHaveBeenCalled()

        const row = await loadInbox(tx, id)
        expect(row.status).toBe("disconnected")
        expect(row.name).toBe("Old name")
      })
    })

    test("skipQuota revives the inbox without touching quota or usage", async () => {
      await withRolledBackTransaction(async (tx) => {
        const { ownerId, workspaceId } = await seedWorkspace(tx)
        const { id, sourceId } = await seedDisconnectedInbox(tx, workspaceId)

        const result = await inboxService.create({
          tx,
          ownerId,
          data: {
            workspaceId,
            channel: "whatsapp",
            sourceId,
            name: "Revived name",
          } as never,
          skipQuota: true,
        })

        expect(mockTryConsume).not.toHaveBeenCalled()
        expect(mockIncrement).not.toHaveBeenCalled()
        expect(result.wasCreated).toBe(true)

        const row = await loadInbox(tx, id)
        expect(row.status).toBe("connected")
      })
    })
  },
)
