import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/redis", () => ({
  distributedLockFactory: vi.fn(() => ({ runExclusive: vi.fn() })),
}))

import { SchedulerClient } from "../src/scheduler-client"

describe("SchedulerClient.batchAddToSchedule", () => {
  test("throws aggregate errors returned by individual pipeline commands", async () => {
    const commandError = new Error("zadd failed")
    const pipeline = {
      exec: vi.fn().mockResolvedValue([
        [null, 1],
        [commandError, null],
      ]),
      zadd: vi.fn(),
    }
    const redis = { pipeline: vi.fn(() => pipeline) }
    const scheduler = new SchedulerClient(redis as never)

    await expect(
      scheduler.batchAddToSchedule([
        { bucket: 1, dispatchId: "dispatch-1", runAtMs: 100 },
        { bucket: 2, dispatchId: "dispatch-2", runAtMs: 200 },
      ]),
    ).rejects.toThrow(AggregateError)

    expect(pipeline.zadd).toHaveBeenNthCalledWith(
      1,
      "seq:dispatch:{1}:schedule",
      100,
      "dispatch-1",
    )
    expect(pipeline.zadd).toHaveBeenNthCalledWith(
      2,
      "seq:dispatch:{2}:schedule",
      200,
      "dispatch-2",
    )
  })

  test("does not create a pipeline when no schedules are supplied", async () => {
    const redis = { pipeline: vi.fn() }
    const scheduler = new SchedulerClient(redis as never)

    await scheduler.batchAddToSchedule([])

    expect(redis.pipeline).not.toHaveBeenCalled()
  })
})
