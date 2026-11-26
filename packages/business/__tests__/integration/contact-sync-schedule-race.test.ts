// @vitest-environment node

/**
 * `contactSyncService.schedule` under two really concurrent requests on a
 * real Postgres: the per-workspace advisory lock serializes them and the
 * availability re-read under it decides the loser, before the live-run
 * unique index (the second barrier) is ever reached. Also the cooldown read
 * by that re-check, right before and right after it ends.
 *
 * Commits for real, so each test deletes its workspace (runs and the
 * integration cascade from it) afterwards.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import { contactSyncRunRepository } from "@chatbotx.io/database/repositories"
import {
  contactSyncRunModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  barrier,
  waitUntilSomeoneWaitsOnAnAdvisoryLock,
  within,
} from "../helpers/template-concurrency"

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

vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
}))

const { contactSyncService } = await import("../../src/contact-sync/service")
const { CONTACT_SYNC_COOLDOWN_MS, CONTACT_SYNC_ERROR_CODES } = await import(
  "../../src/contact-sync/constants"
)

type RunItem = {
  inboxId: string | null
  sourceChannel: "messenger"
  sourceAccountId: string
  sourceAccountName: string
  followUpCoexist: false
  followUpAiReadsSyncedHistory: false
}

const databaseUrl = realDatabaseUrl()

describe.skipIf(!databaseUrl)("contact sync schedule, concurrently", () => {
  const created: { workspaceId: string; userId: string }[] = []

  afterEach(async () => {
    vi.restoreAllMocks()
    for (const { workspaceId, userId } of created.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
      await db.delete(userModel).where(eq(userModel.id, userId))
    }
  })

  /** A fresh workspace with one source; source resolution and enqueue are stubbed. */
  const seed = async () => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `contact-sync-race-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `contact-sync-race-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    created.push({ workspaceId: workspace.id, userId: owner.id })
    const items: RunItem[] = [
      {
        inboxId: null,
        sourceChannel: "messenger",
        sourceAccountId: "page-a",
        sourceAccountName: "Page A",
        followUpCoexist: false,
        followUpAiReadsSyncedHistory: false,
      },
    ]
    vi.spyOn(contactSyncService, "isConfigured").mockReturnValue(true)
    vi.spyOn(
      contactSyncService as unknown as {
        resolveMenuSources: () => Promise<RunItem[]>
      },
      "resolveMenuSources",
    ).mockResolvedValue(items)
    vi.spyOn(contactSyncService, "enqueueChunk").mockResolvedValue(undefined)
    return { workspaceId: workspace.id }
  }

  const request = (workspaceId: string) =>
    contactSyncService.schedule({
      workspaceId,
      sources: [{ inboxId: "1" }],
      triggerSource: "api",
      actor: { type: "api_token", id: "token-1" },
      syncTags: true,
      syncCustomFields: true,
      overwriteExisting: false,
    })

  /** Marks a run finished after it reached its source, `createdAt` set to `at`. */
  const finishFetched = async (runId: string, at: Date) => {
    await db.execute(
      sql`UPDATE "ContactSyncRunItem" SET status = 'succeeded', "startedAt" = ${at}, "finishedAt" = ${at} WHERE "runId" = ${runId}`,
    )
    await db.execute(
      sql`UPDATE "ContactSyncRun" SET status = 'succeeded', "claimToken" = NULL, "createdAt" = ${at}, "startedAt" = ${at}, "finishedAt" = ${at} WHERE id = ${runId}`,
    )
  }

  const codeOf = async (promise: Promise<unknown>) =>
    await promise.then(
      () => null,
      (error: { code?: string; data?: Record<string, string> }) => ({
        code: error.code,
        data: error.data,
      }),
    )

  test("the second of two requests waits on the workspace lock and is refused by the re-read, not the unique index", async () => {
    const { workspaceId } = await seed()
    const gate = barrier()
    const createWithItems = contactSyncRunRepository.createWithItems.bind(
      contactSyncRunRepository,
    )
    const insert = vi
      .spyOn(contactSyncRunRepository, "createWithItems")
      .mockImplementationOnce(async (...args) => {
        await gate.promise
        return await createWithItems(...args)
      })

    const first = request(workspaceId)
    const second = codeOf(request(workspaceId))
    await waitUntilSomeoneWaitsOnAnAdvisoryLock(`contact-sync:${workspaceId}`)
    gate.open()

    const run = await within(first)
    expect(await within(second)).toEqual({
      code: CONTACT_SYNC_ERROR_CODES.alreadyRunning,
      data: { runId: run.id },
    })
    // The loser never tried to insert: the lock + re-read stopped it.
    expect(insert).toHaveBeenCalledTimes(1)
    const runs = await db
      .select({ id: contactSyncRunModel.id })
      .from(contactSyncRunModel)
      .where(eq(contactSyncRunModel.workspaceId, workspaceId))
    expect(runs).toEqual([{ id: run.id }])
  })

  test("two requests right after the cooldown ends start exactly one run; before it ends, none", async () => {
    const { workspaceId } = await seed()
    const previous = await request(workspaceId)

    const withinCooldown = new Date(
      Date.now() - CONTACT_SYNC_COOLDOWN_MS + 60_000,
    )
    await finishFetched(previous.id, withinCooldown)
    const refused = await Promise.all([
      codeOf(request(workspaceId)),
      codeOf(request(workspaceId)),
    ])
    const nextSyncAt = new Date(
      withinCooldown.getTime() + CONTACT_SYNC_COOLDOWN_MS,
    ).toISOString()
    expect(refused).toEqual([
      { code: CONTACT_SYNC_ERROR_CODES.cooldown, data: { nextSyncAt } },
      { code: CONTACT_SYNC_ERROR_CODES.cooldown, data: { nextSyncAt } },
    ])

    await finishFetched(
      previous.id,
      new Date(Date.now() - CONTACT_SYNC_COOLDOWN_MS - 1000),
    )
    const outcomes = await Promise.all([
      codeOf(request(workspaceId)),
      codeOf(request(workspaceId)),
    ])
    expect(outcomes.filter((outcome) => outcome === null)).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome !== null)).toEqual([
      {
        code: CONTACT_SYNC_ERROR_CODES.alreadyRunning,
        data: { runId: expect.any(String) },
      },
    ])
    const live = await db
      .select({ id: contactSyncRunModel.id })
      .from(contactSyncRunModel)
      .where(
        sql`${contactSyncRunModel.workspaceId} = ${workspaceId} AND ${contactSyncRunModel.status} = 'pending'`,
      )
    expect(live).toHaveLength(1)
  })

  test("a run that failed before reaching its source does not start the cooldown", async () => {
    const { workspaceId } = await seed()
    const failed = await request(workspaceId)
    await db.execute(
      sql`UPDATE "ContactSyncRun" SET status = 'failed', "claimToken" = NULL, "finishedAt" = now() WHERE id = ${failed.id}`,
    )
    const next = await request(workspaceId)
    expect(next.id).not.toBe(failed.id)
  })
})
