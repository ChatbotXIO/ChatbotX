// @vitest-environment node

/**
 * Real-Postgres checks of the channel deletion log: a repeat or concurrent
 * disconnect writes one row, a system teardown writes none, and a caller
 * transaction that rolls back takes the row with it.
 */

import { asc, db, eq, sql } from "@chatbotx.io/database/client"
import { inboxRepository } from "@chatbotx.io/database/repositories"
import {
  connectionModel,
  inboxModel,
  resourceDeletionLogModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterAll, describe, expect, test, vi } from "vitest"

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
  quotaEnforcementService: {
    tryConsume: vi.fn().mockResolvedValue({ ok: true }),
    release: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock("../../src/workspace-usage/service", () => ({
  workspaceUsageService: {
    increment: vi.fn().mockResolvedValue(true),
    decrement: vi.fn().mockResolvedValue(undefined),
    rollbackLiveIncrement: vi.fn().mockResolvedValue(undefined),
  },
}))

// Dynamic: `vi.mock` above is hoisted above static imports, so the module
// under test must be imported afterward to pick up the mocked dependencies.
const { connectionStateService } = await import(
  "../../src/connection/state-service"
)

class RollbackSignal extends Error {}

const seeded: { ownerId: string; workspaceId: string }[] = []

const seedChannel = async (options: { withConnection: boolean }) => {
  const ownerId = createId()
  const workspaceId = createId()
  const inboxId = createId()
  const connectionId = createId()
  const sourceId = `deletion-log-${inboxId}`
  await db.insert(userModel).values({
    id: ownerId,
    email: `deletion-log-channel-${ownerId}@example.test`,
    name: "Deletion log channel owner",
  })
  await db.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Deletion log channel workspace",
  })
  seeded.push({ ownerId, workspaceId })
  await db.insert(inboxModel).values({
    id: inboxId,
    workspaceId,
    channel: "webchat",
    name: "Deletion log inbox",
    sourceId,
  })
  if (options.withConnection) {
    await db.insert(connectionModel).values({
      id: connectionId,
      workspaceId,
      provider: "webchat",
      kind: "channel",
      channel: "webchat",
      inboxId,
      sourceId,
      displayName: "Deletion log inbox",
      status: "connected",
      connectedAt: new Date(),
    })
  }
  return { ownerId, workspaceId, inboxId, connectionId }
}

const readLogs = async (workspaceId: string) =>
  await db
    .select()
    .from(resourceDeletionLogModel)
    .where(eq(resourceDeletionLogModel.workspaceId, workspaceId))
    .orderBy(asc(resourceDeletionLogModel.id))

const readInboxStatus = async (inboxId: string) =>
  (await db.query.inboxModel.findFirst({ where: { id: inboxId } }))?.status

afterAll(async () => {
  if (!databaseUrl) {
    return
  }
  for (const { ownerId, workspaceId } of seeded) {
    await db
      .delete(resourceDeletionLogModel)
      .where(eq(resourceDeletionLogModel.workspaceId, workspaceId))
    await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
    await db.delete(userModel).where(eq(userModel.id, ownerId))
  }
})

describe.skipIf(!databaseUrl)("channel deletion log against Postgres", () => {
  test("the inbox lock does not stall writes that reference the inbox", async () => {
    const { workspaceId, inboxId } = await seedChannel({
      withConnection: false,
    })

    await db.transaction(async (holder) => {
      await inboxRepository.findByIdForUpdate(
        { id: inboxId, workspaceId },
        holder,
      )

      // Every message or contact insert that references the inbox takes
      // FOR KEY SHARE on it from its own connection; FOR UPDATE would block it.
      await db.transaction(async (writer) => {
        await writer.execute(sql`SET LOCAL lock_timeout = '2s'`)
        const locked = await writer.execute(
          sql`SELECT 1 FROM "Inbox" WHERE "id" = ${inboxId}::bigint FOR KEY SHARE`,
        )
        expect(locked.rows).toHaveLength(1)
      })
    })
  })

  test("a user disconnect logs one completed channel row with its snapshot", async () => {
    const { ownerId, workspaceId, inboxId, connectionId } = await seedChannel({
      withConnection: true,
    })

    await connectionStateService.transition({
      connectionId,
      event: "user.disconnect",
      ownerId,
    })

    const logs = await readLogs(workspaceId)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      workspaceId,
      resourceType: "channel",
      resourceId: inboxId,
      resourceSubtype: "webchat",
      resourceName: "Deletion log inbox",
      status: "completed",
    })
    expect(logs[0]?.completedAt).toBeInstanceOf(Date)
    expect(await readInboxStatus(inboxId)).toBe("disconnected")
  })

  test("two concurrent user disconnects of one connection log it once", async () => {
    const { ownerId, workspaceId, connectionId } = await seedChannel({
      withConnection: true,
    })

    await Promise.all([
      connectionStateService.transition({
        connectionId,
        event: "user.disconnect",
        ownerId,
      }),
      connectionStateService.transition({
        connectionId,
        event: "user.disconnect",
        ownerId,
      }),
    ])

    expect(await readLogs(workspaceId)).toHaveLength(1)
  })

  test("a system teardown disconnects the channel without logging it", async () => {
    const { ownerId, workspaceId, inboxId, connectionId } = await seedChannel({
      withConnection: true,
    })

    await connectionStateService.transition({
      connectionId,
      event: "teardown.disconnect",
      ownerId,
    })

    expect(await readLogs(workspaceId)).toEqual([])
    expect(await readInboxStatus(inboxId)).toBe("disconnected")
  })

  test("a caller transaction that rolls back after disconnecting leaves no row and a connected channel", async () => {
    const { ownerId, workspaceId, inboxId } = await seedChannel({
      withConnection: true,
    })

    await expect(
      db.transaction(async (tx) => {
        await connectionStateService.disconnectInbox({
          inboxId,
          workspaceId,
          ownerId,
          tx,
        })
        throw new RollbackSignal()
      }),
    ).rejects.toBeInstanceOf(RollbackSignal)

    expect(await readLogs(workspaceId)).toEqual([])
    expect(await readInboxStatus(inboxId)).toBe("connected")
  })

  test("the legacy inbox-only path logs once even when two disconnects race", async () => {
    const { ownerId, workspaceId, inboxId } = await seedChannel({
      withConnection: false,
    })
    const disconnect = () =>
      db.transaction(async (tx) => {
        await connectionStateService.disconnectInbox({
          inboxId,
          workspaceId,
          ownerId,
          tx,
        })
      })

    await Promise.all([disconnect(), disconnect()])

    const logs = await readLogs(workspaceId)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      resourceType: "channel",
      resourceId: inboxId,
      status: "completed",
    })
    expect(await readInboxStatus(inboxId)).toBe("disconnected")
  })

  test("the legacy path without a transaction logs after the disconnect", async () => {
    const { ownerId, workspaceId, inboxId } = await seedChannel({
      withConnection: false,
    })

    await connectionStateService.disconnectInbox({
      inboxId,
      workspaceId,
      ownerId,
    })

    expect((await readLogs(workspaceId)).map((row) => row.status)).toEqual([
      "completed",
    ])
    expect(await readInboxStatus(inboxId)).toBe("disconnected")
  })
})
