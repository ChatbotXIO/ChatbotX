import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// purgeBroadcasts — 5-minute cron that chunk-purges `ContactOnBroadcast`
// recipient rows and hard-deletes soft-deleted `Broadcast` rows once fully
// drained. Verifies: fail-fast lock acquisition (no retry queueing), the
// listPurgeableBroadcasts→mapWithConcurrency claim-under-lock flow, the
// drained+empty-probe hard-delete gate, idempotent skip on an undrained or
// still-populated broadcast, per-item isolation, and the summary log line.
// ---------------------------------------------------------------------------

const listPurgeableBroadcasts = vi.fn()
const purgeBroadcastRecipients = vi.fn()
const hasBroadcastRecipients = vi.fn()
const hardDeleteBroadcast = vi.fn()
const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
const lockExists = vi.fn()
const info = vi.fn()
const warn = vi.fn()
const error = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  listPurgeableBroadcasts: (...args: unknown[]) =>
    listPurgeableBroadcasts(...args),
  purgeBroadcastRecipients: (...args: unknown[]) =>
    purgeBroadcastRecipients(...args),
  hasBroadcastRecipients: (...args: unknown[]) =>
    hasBroadcastRecipients(...args),
  hardDeleteBroadcast: (...args: unknown[]) => hardDeleteBroadcast(...args),
}))
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
  distributedStore: { exists: lockExists },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info, warn, error }),
}))

const { purgeBroadcasts } = await import(
  "../src/schedule/handlers/purge-broadcasts"
)

// Mirrors the real handler's MAX_RUN_DURATION_MS (4 minutes) so the deadline
// test can advance the fake clock past exactly that budget.
const MAX_RUN_DURATION_MS = 4 * 60 * 1000

beforeEach(() => {
  listPurgeableBroadcasts.mockReset()
  purgeBroadcastRecipients.mockReset()
  hasBroadcastRecipients.mockReset()
  hardDeleteBroadcast.mockReset()
  runExclusive.mockClear()
  runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => fn(),
  )
  lockExists.mockReset()
  lockExists.mockResolvedValue(false)
  info.mockReset()
  warn.mockReset()
  error.mockReset()
  listPurgeableBroadcasts.mockResolvedValue([])
})

describe("purgeBroadcasts", () => {
  test("acquires the lock fail-fast with a 10-minute timeout and no retry queueing", async () => {
    await purgeBroadcasts()

    expect(runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "schedule:purge-broadcasts",
        timeoutInSeconds: 600,
        retryTimeoutInSeconds: 0,
      }),
    )
  })

  test("skips with a warning and does not run the purge when the lock is genuinely held", async () => {
    const err = Object.assign(new Error("lock held"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: "schedule:purge-broadcasts",
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(true)

    await expect(purgeBroadcasts()).resolves.toBeUndefined()

    expect(lockExists).toHaveBeenCalledWith("schedule:purge-broadcasts")
    expect(listPurgeableBroadcasts).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith({ err }, expect.stringContaining("lock"))
  })

  test("logs a distinct infrastructure warning and rethrows when acquisition fails but the lock is NOT held", async () => {
    const err = Object.assign(new Error("acquisition failed"), {
      name: "LockAcquisitionError",
      code: "LOCK_ACQUISITION_FAILED",
      key: "schedule:purge-broadcasts",
    })
    runExclusive.mockRejectedValueOnce(err)
    lockExists.mockResolvedValueOnce(false)

    await expect(purgeBroadcasts()).rejects.toBe(err)

    expect(lockExists).toHaveBeenCalledWith("schedule:purge-broadcasts")
    expect(listPurgeableBroadcasts).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      { err },
      expect.stringContaining("infrastructure"),
    )
    // Never the "skipped ... held the lock" overlap message — that would
    // mask a real outage as a routine skip.
    expect(warn).not.toHaveBeenCalledWith(
      { err },
      expect.stringContaining("held the lock"),
    )
  })

  test("rethrows non-lock errors from lock acquisition without probing the lock", async () => {
    const err = new Error("redis unavailable")
    runExclusive.mockRejectedValueOnce(err)

    await expect(purgeBroadcasts()).rejects.toBe(err)
    expect(lockExists).not.toHaveBeenCalled()
    expect(listPurgeableBroadcasts).not.toHaveBeenCalled()
  })

  test("claims candidates under the lock and hard-deletes a drained broadcast with no remaining recipients", async () => {
    listPurgeableBroadcasts.mockResolvedValueOnce([{ id: "b1" }])
    purgeBroadcastRecipients.mockResolvedValueOnce({
      deleted: 500,
      stopReason: "drained",
    })
    hasBroadcastRecipients.mockResolvedValueOnce(false)
    hardDeleteBroadcast.mockResolvedValueOnce(true)

    await purgeBroadcasts()

    expect(listPurgeableBroadcasts).toHaveBeenCalledWith(50)
    expect(purgeBroadcastRecipients).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcastId: "b1",
        chunkSize: 1000,
        interChunkDelayMs: 100,
        maxRunDurationMs: expect.any(Number),
      }),
    )
    expect(hasBroadcastRecipients).toHaveBeenCalledWith("b1")
    expect(hardDeleteBroadcast).toHaveBeenCalledWith("b1")
  })

  test("keeps the broadcast when drained but the probe still finds rows", async () => {
    listPurgeableBroadcasts.mockResolvedValueOnce([{ id: "b1" }])
    purgeBroadcastRecipients.mockResolvedValueOnce({
      deleted: 500,
      stopReason: "drained",
    })
    hasBroadcastRecipients.mockResolvedValueOnce(true)

    await purgeBroadcasts()

    expect(hasBroadcastRecipients).toHaveBeenCalledWith("b1")
    expect(hardDeleteBroadcast).not.toHaveBeenCalled()
  })

  test("keeps the broadcast and never probes when the run stopped at the deadline", async () => {
    listPurgeableBroadcasts.mockResolvedValueOnce([{ id: "b1" }])
    purgeBroadcastRecipients.mockResolvedValueOnce({
      deleted: 1000,
      stopReason: "deadline",
    })

    await purgeBroadcasts()

    expect(hasBroadcastRecipients).not.toHaveBeenCalled()
    expect(hardDeleteBroadcast).not.toHaveBeenCalled()
  })

  test("keeps the broadcast and never probes when the run stopped at the chunk cap", async () => {
    listPurgeableBroadcasts.mockResolvedValueOnce([{ id: "b1" }])
    purgeBroadcastRecipients.mockResolvedValueOnce({
      deleted: 5_000_000,
      stopReason: "chunkCap",
    })

    await purgeBroadcasts()

    expect(hasBroadcastRecipients).not.toHaveBeenCalled()
    expect(hardDeleteBroadcast).not.toHaveBeenCalled()
  })

  test("continues processing other broadcasts when one purgeOne call throws", async () => {
    listPurgeableBroadcasts.mockResolvedValueOnce([
      { id: "bad" },
      { id: "good" },
    ])
    purgeBroadcastRecipients.mockImplementation(
      ({ broadcastId }: { broadcastId: string }) => {
        if (broadcastId === "bad") {
          return Promise.reject(new Error("boom"))
        }
        return Promise.resolve({ deleted: 10, stopReason: "drained" })
      },
    )
    hasBroadcastRecipients.mockResolvedValue(false)
    hardDeleteBroadcast.mockResolvedValue(true)

    await expect(purgeBroadcasts()).resolves.toBeUndefined()

    expect(purgeBroadcastRecipients).toHaveBeenCalledTimes(2)
    expect(hardDeleteBroadcast).toHaveBeenCalledWith("good")
    expect(hardDeleteBroadcast).not.toHaveBeenCalledWith("bad")
  })

  test("logs one summary line with claimed / recipientsDeleted / broadcastsDeleted / stopReasons", async () => {
    listPurgeableBroadcasts.mockResolvedValueOnce([{ id: "b1" }, { id: "b2" }])
    purgeBroadcastRecipients
      .mockResolvedValueOnce({ deleted: 500, stopReason: "drained" })
      .mockResolvedValueOnce({ deleted: 1000, stopReason: "deadline" })
    hasBroadcastRecipients.mockResolvedValueOnce(false)
    hardDeleteBroadcast.mockResolvedValueOnce(true)

    await purgeBroadcasts()

    expect(info).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith(
      {
        claimed: 2,
        recipientsDeleted: 1500,
        broadcastsDeleted: 1,
        stopReasons: { drained: 1, deadline: 1 },
      },
      expect.stringContaining("purgeBroadcasts"),
    )
  })

  test("does nothing when there are no purgeable candidates", async () => {
    listPurgeableBroadcasts.mockResolvedValueOnce([])

    await purgeBroadcasts()

    expect(purgeBroadcastRecipients).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith(
      {
        claimed: 0,
        recipientsDeleted: 0,
        broadcastsDeleted: 0,
        stopReasons: {},
      },
      expect.stringContaining("purgeBroadcasts"),
    )
  })

  test("threads a depleted (zero) remaining budget into the second call once the first exhausts the run deadline", async () => {
    vi.useFakeTimers()
    try {
      listPurgeableBroadcasts.mockResolvedValueOnce([
        { id: "b1" },
        { id: "b2" },
      ])
      purgeBroadcastRecipients
        .mockImplementationOnce(() => {
          // Advances the fake clock past MAX_RUN_DURATION_MS *synchronously*
          // (no await before it) so it takes effect before the second
          // concurrent worker computes its own remaining budget — see
          // mapWithConcurrency: with 2 candidates and concurrency 5, both
          // workers are spawned in the same synchronous burst, so whichever
          // of them yields to a promise first still lets this run first.
          vi.advanceTimersByTime(MAX_RUN_DURATION_MS + 1)
          return Promise.resolve({ deleted: 500, stopReason: "drained" })
        })
        .mockImplementationOnce(
          ({ maxRunDurationMs }: { maxRunDurationMs: number }) =>
            Promise.resolve({
              // Real purgeBroadcastRecipients checks the deadline BEFORE
              // issuing any DELETE, so a 0ms budget safely short-circuits
              // to `deadline` with zero rows touched — never a live query.
              deleted: maxRunDurationMs === 0 ? 0 : -1,
              stopReason: "deadline",
            }),
        )
      hasBroadcastRecipients.mockResolvedValue(false)
      hardDeleteBroadcast.mockResolvedValue(true)

      await purgeBroadcasts()

      expect(purgeBroadcastRecipients).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ broadcastId: "b2", maxRunDurationMs: 0 }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  test("skips immediately when a local purge is already running", async () => {
    let resolveCandidates: (() => void) | undefined
    listPurgeableBroadcasts.mockImplementationOnce(
      () =>
        new Promise<{ id: string }[]>((resolve) => {
          resolveCandidates = () => resolve([])
        }),
    )

    const firstRun = purgeBroadcasts()
    await Promise.resolve()
    await expect(purgeBroadcasts()).resolves.toBeUndefined()

    expect(runExclusive).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      "purgeBroadcasts: skipped because a local purge is still running",
    )

    resolveCandidates?.()
    await firstRun
  })
})
