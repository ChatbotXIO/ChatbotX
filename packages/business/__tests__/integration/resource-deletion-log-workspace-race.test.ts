// @vitest-environment node

/**
 * Real-Postgres checks of the workspace deletion log under concurrency and
 * rollback. Mocks cannot prove row-lock serialization or SQL rollback, so these
 * run against committed rows from separate connections and clean up after.
 */

import { asc, db, eq, sql } from "@chatbotx.io/database/client"
import { workspaceRepository } from "@chatbotx.io/database/repositories/workspace"
import {
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

vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(async () => undefined),
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

// Dynamic: `vi.mock` above is hoisted above static imports, so the modules
// under test must be imported afterward to pick up the mocked dependencies.
const { workspaceService } = await import("../../src/workspace/service")
const { resourceDeletionLogService } = await import(
  "../../src/resource-deletion-log/service"
)

class RollbackSignal extends Error {}

const seeded: { ownerId: string; workspaceId: string }[] = []

const seedWorkspace = async (): Promise<{
  ownerId: string
  workspaceId: string
}> => {
  const ownerId = createId()
  const workspaceId = createId()
  await db.insert(userModel).values({
    id: ownerId,
    email: `deletion-log-race-${ownerId}@example.test`,
    name: "Deletion log race owner",
  })
  await db.insert(workspaceModel).values({
    id: workspaceId,
    ownerId,
    name: "Deletion log race workspace",
  })
  seeded.push({ ownerId, workspaceId })
  return { ownerId, workspaceId }
}

const readLogs = async (workspaceId: string) =>
  await db
    .select()
    .from(resourceDeletionLogModel)
    .where(eq(resourceDeletionLogModel.workspaceId, workspaceId))
    .orderBy(asc(resourceDeletionLogModel.id))

/** Postgres error code for a statement that gave up waiting on a lock. */
const LOCK_NOT_AVAILABLE = "55P03"

const lockTimeoutCode = (error: unknown): string | undefined => {
  const cause = error instanceof Error ? error.cause : undefined
  return cause instanceof Error && "code" in cause
    ? String(cause.code)
    : undefined
}

const readWorkspace = async (workspaceId: string) =>
  await db.query.workspaceModel.findFirst({ where: { id: workspaceId } })

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

describe.skipIf(!databaseUrl)("workspace deletion log against Postgres", () => {
  test("two concurrent first submissions leave one pending request and one canceled", async () => {
    const { workspaceId } = await seedWorkspace()
    const actorA = createId()
    const actorB = createId()

    await Promise.all([
      workspaceService.scheduleDeletion({ id: workspaceId, actorId: actorA }),
      workspaceService.scheduleDeletion({ id: workspaceId, actorId: actorB }),
    ])

    const logs = await readLogs(workspaceId)
    const workspace = await readWorkspace(workspaceId)
    expect(logs.map((row) => row.status).sort()).toEqual([
      "canceled",
      "pending",
    ])
    const pending = logs.find((row) => row.status === "pending")
    // The request the log keeps is the one the workspace itself kept.
    expect(pending?.requestedByUserId).toBe(workspace?.deletionRequestedById)
    expect(logs.every((row) => row.resourceId === workspaceId)).toBe(true)
  })

  test("a submission racing a cancellation never leaves two pending requests or a stale one", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { workspaceId } = await seedWorkspace()
      await workspaceService.scheduleDeletion({
        id: workspaceId,
        actorId: createId(),
      })

      await Promise.all([
        workspaceService.cancelDeletion({ id: workspaceId }),
        workspaceService.scheduleDeletion({
          id: workspaceId,
          actorId: createId(),
        }),
      ])

      const pending = (await readLogs(workspaceId)).filter(
        (row) => row.status === "pending",
      )
      const workspace = await readWorkspace(workspaceId)
      if (workspace?.scheduledDeletionAt) {
        expect(pending).toHaveLength(1)
        expect(pending[0]?.requestedByUserId).toBe(
          workspace.deletionRequestedById,
        )
      } else {
        expect(pending).toHaveLength(0)
      }
    }
  })

  test("a cancellation after the purge fence is refused and leaves the request pending", async () => {
    const { workspaceId } = await seedWorkspace()
    await workspaceService.scheduleDeletion({
      id: workspaceId,
      actorId: createId(),
    })
    await db
      .update(workspaceModel)
      .set({ purgeStartedAt: new Date() })
      .where(eq(workspaceModel.id, workspaceId))

    await expect(
      workspaceService.cancelDeletion({ id: workspaceId }),
    ).rejects.toMatchObject({ code: "workspaceDeletionStarted" })
    await expect(
      workspaceService.scheduleDeletion({
        id: workspaceId,
        actorId: createId(),
      }),
    ).rejects.toMatchObject({ code: "workspaceDeletionStarted" })

    const logs = await readLogs(workspaceId)
    expect(logs.map((row) => row.status)).toEqual(["pending"])
  })

  test("a caller transaction that rolls back after submitting leaves neither a log row nor a schedule", async () => {
    const { workspaceId } = await seedWorkspace()

    await expect(
      db.transaction(async (tx) => {
        await workspaceService.scheduleDeletion({
          id: workspaceId,
          actorId: createId(),
          tx,
        })
        throw new RollbackSignal()
      }),
    ).rejects.toBeInstanceOf(RollbackSignal)

    expect(await readLogs(workspaceId)).toEqual([])
    expect((await readWorkspace(workspaceId))?.scheduledDeletionAt).toBeNull()
  })

  test("the deletion lock does not stall writes that reference the workspace", async () => {
    const { workspaceId } = await seedWorkspace()

    await db.transaction(async (holder) => {
      await workspaceRepository.findByIdForUpdate({ id: workspaceId }, holder)

      // A child-table writer takes FOR KEY SHARE on the workspace from its own
      // connection; a plain FOR UPDATE would make it wait for `holder`.
      await db.transaction(async (writer) => {
        await writer.execute(sql`SET LOCAL lock_timeout = '2s'`)
        await expect(
          workspaceRepository.lockWorkspaceForChildWrite(
            { workspaceId },
            writer,
          ),
        ).resolves.toBe(true)
      })
    })
  })

  test("the deletion lock still serializes against the purge fence's FOR UPDATE", async () => {
    const { workspaceId } = await seedWorkspace()

    await db.transaction(async (fence) => {
      await fence.execute(
        sql`SELECT 1 FROM "Workspace" WHERE "id" = ${workspaceId}::bigint FOR UPDATE`,
      )

      const attempt = db.transaction(async (request) => {
        await request.execute(sql`SET LOCAL lock_timeout = '500ms'`)
        await workspaceRepository.findByIdForUpdate(
          { id: workspaceId },
          request,
        )
      })

      await expect(attempt).rejects.toSatisfy(
        (error: unknown) => lockTimeoutCode(error) === LOCK_NOT_AVAILABLE,
      )
    })
  })

  test("completing a request inside a transaction that rolls back leaves it pending", async () => {
    const { workspaceId } = await seedWorkspace()
    await workspaceService.scheduleDeletion({
      id: workspaceId,
      actorId: createId(),
    })
    const pendingId = await resourceDeletionLogService.findPendingId({
      resource: { type: "workspace", id: workspaceId, workspaceId },
    })
    expect(pendingId).toBeDefined()

    await expect(
      db.transaction(async (tx) => {
        const completed = await resourceDeletionLogService.completePending({
          id: pendingId as string,
          tx,
        })
        expect(completed).toBe(1)
        throw new RollbackSignal()
      }),
    ).rejects.toBeInstanceOf(RollbackSignal)

    expect((await readLogs(workspaceId)).map((row) => row.status)).toEqual([
      "pending",
    ])
  })
})
