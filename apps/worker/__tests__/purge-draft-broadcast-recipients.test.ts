import { DelayedError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const purgeDraftRecipients = vi.fn()
const loggerWarnSpy = vi.fn()
const blockedWorkspaceIds = new Set<string>()

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: {
    purgeDraftRecipients: (...args: unknown[]) => purgeDraftRecipients(...args),
  },
}))

vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: async (workspaceId: string) =>
    blockedWorkspaceIds.has(workspaceId),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => loggerWarnSpy(...args) },
}))

const { purgeDraftBroadcastRecipients, PURGE_DRAFT_RECIPIENTS_POLICY } =
  await import("../src/schedule/handlers/purge-draft-broadcast-recipients")

const BROADCAST_ID = "b-1"
const WORKSPACE_ID = "ws-1"
const TOKEN = "lock-token"

/** A job deferred `passes` times so far (BullMQ: attemptsStarted - attemptsMade - 1). */
const jobAfter = (passes: number) => ({
  id: "job-1",
  name: "purgeDraftBroadcastRecipients",
  attemptsStarted: passes + 1,
  attemptsMade: 0,
  moveToDelayed: vi.fn(async () => undefined),
})

beforeEach(() => {
  purgeDraftRecipients.mockReset()
  loggerWarnSpy.mockReset()
  blockedWorkspaceIds.clear()
})

describe("purgeDraftBroadcastRecipients", () => {
  test("finishes once the draft holds nothing", async () => {
    purgeDraftRecipients.mockResolvedValue({ done: true })
    const job = jobAfter(0)

    await purgeDraftBroadcastRecipients({
      job,
      token: TOKEN,
      workspaceId: WORKSPACE_ID,
      broadcastId: BROADCAST_ID,
    })

    expect(purgeDraftRecipients).toHaveBeenCalledWith({
      broadcastId: BROADCAST_ID,
    })
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  // Each pass is bounded; between passes the shared schedule slot is free.
  test("parks the job for another pass while leftovers remain", async () => {
    purgeDraftRecipients.mockResolvedValue({ done: false })
    const job = jobAfter(0)
    const before = Date.now()

    await expect(
      purgeDraftBroadcastRecipients({
        job,
        token: TOKEN,
        workspaceId: WORKSPACE_ID,
        broadcastId: BROADCAST_ID,
      }),
    ).rejects.toBeInstanceOf(DelayedError)

    const [timestamp, token] = job.moveToDelayed.mock.calls[0] as [
      number,
      string,
    ]
    expect(token).toBe(TOKEN)
    expect(timestamp).toBeGreaterThanOrEqual(
      before + PURGE_DRAFT_RECIPIENTS_POLICY.retryDelayMs,
    )
  })

  // The next re-schedule attempt queues the cleanup again, so giving up here
  // never leaves the draft stuck for good.
  test("stops and warns after the last allowed pass", async () => {
    purgeDraftRecipients.mockResolvedValue({ done: false })
    const job = jobAfter(PURGE_DRAFT_RECIPIENTS_POLICY.maxPasses)

    await purgeDraftBroadcastRecipients({
      job,
      token: TOKEN,
      workspaceId: WORKSPACE_ID,
      broadcastId: BROADCAST_ID,
    })

    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ broadcastId: BROADCAST_ID }),
      expect.stringContaining("leftover recipients remain"),
    )
  })

  test("cannot park the job without the worker lock token, so it stops and warns", async () => {
    purgeDraftRecipients.mockResolvedValue({ done: false })
    const job = jobAfter(0)

    await purgeDraftBroadcastRecipients({
      job,
      token: undefined,
      workspaceId: WORKSPACE_ID,
      broadcastId: BROADCAST_ID,
    })

    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(loggerWarnSpy).toHaveBeenCalled()
  })

  test("is a no-op for a blocked owner: nothing deleted, nothing deferred", async () => {
    blockedWorkspaceIds.add(WORKSPACE_ID)
    const job = jobAfter(0)

    await purgeDraftBroadcastRecipients({
      job,
      token: TOKEN,
      workspaceId: WORKSPACE_ID,
      broadcastId: BROADCAST_ID,
    })

    expect(purgeDraftRecipients).not.toHaveBeenCalled()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  test("propagates a failed pass so BullMQ records it", async () => {
    purgeDraftRecipients.mockRejectedValue(new Error("db down"))

    await expect(
      purgeDraftBroadcastRecipients({
        job: jobAfter(0),
        token: TOKEN,
        workspaceId: WORKSPACE_ID,
        broadcastId: BROADCAST_ID,
      }),
    ).rejects.toThrow("db down")
  })
})
