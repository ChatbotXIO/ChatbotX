import { beforeEach, describe, expect, test, vi } from "vitest"

const listDueExpiredTrials = vi.fn()
const addBulk = vi.fn()
const add = vi.fn()
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)

vi.mock("@chatbotx.io/business", () => ({
  userQuotaService: { listDueExpiredTrials },
}))
vi.mock("@chatbotx.io/redis", () => ({ distributedLock: { runExclusive } }))
vi.mock("@chatbotx.io/worker-config", () => ({
  ScheduleJobData: {
    unsubscribeExpiredTrials: "unsubscribeExpiredTrials",
    teardownExpiredTrial: "teardownExpiredTrial",
  },
  scheduleQueue: { addBulk, add },
  teardownExpiredTrialJobId: (userId: string) =>
    `teardown-expired-trial-${userId}`,
}))

const { unsubscribeExpiredTrials } = await import(
  "../src/schedule/handlers/unsubscribe-expired-trials"
)

beforeEach(() => {
  listDueExpiredTrials.mockReset()
  addBulk.mockReset()
  add.mockReset()
  runExclusive.mockClear()
  listDueExpiredTrials.mockResolvedValue({ userIds: [], nextCursor: undefined })
})

describe("unsubscribeExpiredTrials", () => {
  test("fans out due owners and forwards the scan cursor", async () => {
    listDueExpiredTrials.mockResolvedValue({
      userIds: ["owner-1", "owner-2"],
      nextCursor: "owner-2",
    })

    await unsubscribeExpiredTrials("owner-0")

    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:unsubscribe-expired-trials",
        timeoutInSeconds: 55,
      }),
    )
    expect(listDueExpiredTrials).toHaveBeenCalledWith({
      cutoff: expect.any(Date),
      cursor: "owner-0",
      limit: 500,
    })
    expect(addBulk).toHaveBeenCalledWith([
      {
        name: "teardownExpiredTrial",
        data: {
          type: "teardownExpiredTrial",
          data: { userId: "owner-1" },
        },
        opts: {
          jobId: "teardown-expired-trial-owner-1",
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 3600 },
        },
      },
      {
        name: "teardownExpiredTrial",
        data: {
          type: "teardownExpiredTrial",
          data: { userId: "owner-2" },
        },
        opts: {
          jobId: "teardown-expired-trial-owner-2",
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 3600 },
        },
      },
    ])
    expect(add).toHaveBeenCalledWith(
      "unsubscribeExpiredTrials",
      {
        type: "unsubscribeExpiredTrials",
        data: { cursor: "owner-2" },
      },
      {
        jobId: "unsubscribe-expired-trials-scan-owner-2",
        removeOnComplete: true,
        removeOnFail: true,
      },
    )

    const jobIds = addBulk.mock.calls[0][0].map(
      (job: { opts: { jobId: string } }) => job.opts.jobId,
    )
    expect(jobIds.every((jobId: string) => !jobId.includes(":"))).toBe(true)
  })

  test("does not enqueue a continuation for a short page", async () => {
    listDueExpiredTrials.mockResolvedValue({ userIds: ["owner-1"] })

    await unsubscribeExpiredTrials()

    expect(addBulk).toHaveBeenCalledOnce()
    expect(add).not.toHaveBeenCalled()
  })

  test("does not enqueue anything when no owners are due", async () => {
    await unsubscribeExpiredTrials()

    expect(addBulk).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })
})
