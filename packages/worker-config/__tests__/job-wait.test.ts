import { describe, expect, test, vi } from "vitest"
import { waitForJobCompletionWithRetries } from "../src/lib/job-wait"
import {
  getHeavyJobCompletionWaitTimeoutMs,
  HeavyJobAction,
} from "../src/queues/heavy"

describe("waitForJobCompletionWithRetries", () => {
  test("waits through failed attempts until the job completes", async () => {
    const waitUntilFinished = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary provider failure"))
      .mockResolvedValueOnce({ status: "success" })
    const getJob = vi.fn().mockResolvedValue({
      attemptsMade: 1,
      opts: { attempts: 2 },
    })
    const job = {
      id: "job-1",
      attemptsMade: 0,
      opts: { attempts: 2 },
      waitUntilFinished,
    }

    await expect(
      waitForJobCompletionWithRetries(job, { getJob }, {}, 1000),
    ).resolves.toEqual({ status: "success" })
    expect(waitUntilFinished).toHaveBeenCalledTimes(2)
    expect(getJob).toHaveBeenCalledOnce()
  })

  test("throws after the final attempt fails", async () => {
    const error = new Error("permanent provider failure")
    const waitUntilFinished = vi.fn().mockRejectedValue(error)
    const getJob = vi.fn().mockResolvedValue({
      attemptsMade: 2,
      opts: { attempts: 2 },
    })
    const job = {
      id: "job-1",
      attemptsMade: 1,
      opts: { attempts: 2 },
      waitUntilFinished,
    }

    await expect(
      waitForJobCompletionWithRetries(job, { getJob }, {}, 1000),
    ).rejects.toBe(error)
    expect(waitUntilFinished).toHaveBeenCalledOnce()
  })

  test("keeps enough wait budget for a slow attempt and its retry backoff", async () => {
    let now = 0
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now)
    const waitUntilFinished = vi
      .fn()
      .mockImplementationOnce(() => {
        now = 120_000
        return Promise.reject(new Error("temporary provider failure"))
      })
      .mockResolvedValueOnce({ status: "success" })
    const getJob = vi.fn().mockResolvedValue({
      attemptsMade: 1,
      opts: { attempts: 2 },
    })
    const job = {
      id: "job-1",
      attemptsMade: 0,
      opts: { attempts: 2 },
      waitUntilFinished,
    }
    const timeoutMs = getHeavyJobCompletionWaitTimeoutMs(
      HeavyJobAction.aiGenerateImage,
      120_000,
    )

    try {
      await expect(
        waitForJobCompletionWithRetries(job, { getJob }, {}, timeoutMs),
      ).resolves.toEqual({ status: "success" })
    } finally {
      nowSpy.mockRestore()
    }

    expect(timeoutMs).toBe(330_000)
    expect(waitUntilFinished).toHaveBeenNthCalledWith(1, {}, 330_000)
    expect(waitUntilFinished).toHaveBeenNthCalledWith(2, {}, 210_000)
  })

  test("throws a retryable state error when it cannot inspect the queued job", async () => {
    const waitUntilFinished = vi
      .fn()
      .mockRejectedValue(new Error("temporary provider failure"))
    const getJob = vi.fn().mockRejectedValue(new Error("Redis unavailable"))
    const job = {
      id: "job-1",
      attemptsMade: 0,
      opts: { attempts: 2 },
      waitUntilFinished,
    }

    await expect(
      waitForJobCompletionWithRetries(job, { getJob }, {}, 1000),
    ).rejects.toMatchObject({ name: "JobCompletionStateUnknownError" })
  })
})
