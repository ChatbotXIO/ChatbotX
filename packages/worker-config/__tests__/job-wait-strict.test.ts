import { describe, expect, test, vi } from "vitest"
import { waitForJobResult } from "../src/lib/job-wait"

const fakeQueueEvents = {} as never

describe("waitForJobResult (strict variant)", () => {
  test("resolves with the job's result", async () => {
    const job = {
      waitUntilFinished: vi.fn(async () => "sofia status gateway wa-1\nNOREG"),
    }

    const result = await waitForJobResult(job as never, fakeQueueEvents, 15_000)
    expect(result).toBe("sofia status gateway wa-1\nNOREG")
    expect(job.waitUntilFinished).toHaveBeenCalledWith(fakeQueueEvents, 15_000)
  })

  test("rejects when the wait times out (unlike the best-effort helper, never swallowed)", async () => {
    const job = {
      waitUntilFinished: vi.fn(() =>
        Promise.reject(new Error("job wait timed out before finishing")),
      ),
    }

    await expect(
      waitForJobResult(job as never, fakeQueueEvents, 15_000),
    ).rejects.toThrow("job wait timed out before finishing")
  })

  test("rejects when the underlying job fails", async () => {
    const job = {
      waitUntilFinished: vi.fn(() =>
        Promise.reject(new Error("-ERR gateway wa-1 not found")),
      ),
    }

    await expect(
      waitForJobResult(job as never, fakeQueueEvents, 15_000),
    ).rejects.toThrow("-ERR gateway wa-1 not found")
  })
})
