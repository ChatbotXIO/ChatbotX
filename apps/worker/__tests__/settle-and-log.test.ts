// @vitest-environment node
import { describe, expect, test, vi } from "vitest"
import { settleAndLog } from "../src/lib/settle-and-log"

describe("settleAndLog", () => {
  test("runs every item even when one rejects, and logs the failure once", async () => {
    const log = { error: vi.fn() }
    const run = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("redis"))
      .mockResolvedValueOnce(undefined)

    const failed = await settleAndLog({
      items: ["a", "b", "c"],
      concurrency: 2,
      run,
      log,
      failureMessage: "Could not enqueue",
      logContext: { templateId: "t1" },
    })

    expect(failed).toBe(1)
    expect(run).toHaveBeenCalledTimes(3)
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(log.error).toHaveBeenCalledWith(
      { templateId: "t1", failed: 1, err: expect.any(Error) },
      "Could not enqueue",
    )
  })

  test("does not log when everything succeeds", async () => {
    const log = { error: vi.fn() }

    const failed = await settleAndLog({
      items: [1, 2],
      concurrency: 2,
      run: () => Promise.resolve(),
      log,
      failureMessage: "unused",
    })

    expect(failed).toBe(0)
    expect(log.error).not.toHaveBeenCalled()
  })
})
