import { DelayedError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const warn = vi.fn()
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ warn }),
}))

class LockAcquisitionError extends Error {
  override name = "LockAcquisitionError"
}
vi.mock("@chatbotx.io/redis", () => ({ LockAcquisitionError }))

const {
  LOCK_CONTENTION_POLICY,
  deferOnLockContention,
  deferralsSoFar,
  lockContentionDelayMs,
} = await import("../src/lib/lock-contention-deferral")

const makeJob = (
  overrides: { attemptsStarted?: number; attemptsMade?: number } = {},
) => ({
  id: "job-1",
  name: "incomingMessage",
  attemptsStarted: 1,
  attemptsMade: 0,
  moveToDelayed: vi.fn(async () => undefined),
  ...overrides,
})

const lockError = () => new LockAcquisitionError("Failed to acquire lock")
const REDLOCK_RETRY_DELAY_MS = 200

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

test("waits one second before deferring lock contention", () => {
  expect(LOCK_CONTENTION_POLICY.lockWaitSeconds).toBe(1)
  expect(
    Math.ceil(
      (LOCK_CONTENTION_POLICY.lockWaitSeconds * 1000) / REDLOCK_RETRY_DELAY_MS,
    ),
  ).toBe(5)
})

describe("deferralsSoFar", () => {
  test.each([
    { attemptsStarted: 1, attemptsMade: 0, expected: 0 },
    { attemptsStarted: 3, attemptsMade: 0, expected: 2 },
    // A real failure consumed one start; the retry's first run is not a deferral.
    { attemptsStarted: 2, attemptsMade: 1, expected: 0 },
    { attemptsStarted: 4, attemptsMade: 1, expected: 2 },
    // Never negative, even for a job hash predating `attemptsStarted`.
    { attemptsStarted: 0, attemptsMade: 0, expected: 0 },
  ])("started=$attemptsStarted made=$attemptsMade → $expected", ({
    attemptsStarted,
    attemptsMade,
    expected,
  }) => {
    expect(deferralsSoFar({ attemptsStarted, attemptsMade })).toBe(expected)
  })
})

describe("lockContentionDelayMs", () => {
  test("doubles per deferral with equal jitter and caps at maxDelayMs", () => {
    const { baseDelayMs, maxDelayMs } = LOCK_CONTENTION_POLICY
    expect(lockContentionDelayMs(0, () => 0)).toBe(baseDelayMs / 2)
    expect(lockContentionDelayMs(0, () => 1)).toBe(baseDelayMs)
    expect(lockContentionDelayMs(1, () => 1)).toBe(baseDelayMs * 2)
    expect(lockContentionDelayMs(2, () => 0.5)).toBe(baseDelayMs * 4 * 0.75)
    expect(lockContentionDelayMs(10, () => 1)).toBe(maxDelayMs)
    expect(lockContentionDelayMs(10, () => 0)).toBe(maxDelayMs / 2)
  })
})

describe("deferOnLockContention", () => {
  test("returns the processor result untouched", async () => {
    const job = makeJob()

    await expect(
      deferOnLockContention(job, "token", async () => "done"),
    ).resolves.toBe("done")

    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  test("rethrows any other error without touching the job", async () => {
    const job = makeJob()
    const boom = new Error("boom")

    await expect(
      deferOnLockContention(job, "token", () => Promise.reject(boom)),
    ).rejects.toBe(boom)

    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  test("parks the job in the delayed set and signals BullMQ with DelayedError", async () => {
    vi.useFakeTimers({ now: 1_000_000 })
    const job = makeJob()
    const error = lockError()

    await expect(
      deferOnLockContention(job, "token", () => Promise.reject(error)),
    ).rejects.toBeInstanceOf(DelayedError)

    expect(job.moveToDelayed).toHaveBeenCalledOnce()
    const [timestamp, token] = job.moveToDelayed.mock.calls[0] as [
      number,
      string,
    ]
    expect(token).toBe("token")
    const { baseDelayMs } = LOCK_CONTENTION_POLICY
    expect(timestamp).toBeGreaterThanOrEqual(1_000_000 + baseDelayMs / 2)
    expect(timestamp).toBeLessThanOrEqual(1_000_000 + baseDelayMs)
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, jobId: "job-1", deferral: 0 }),
      expect.any(String),
    )
  })

  test("recognises the error by name when it is not the same class instance", async () => {
    const job = makeJob()
    const foreign = new Error("Failed to acquire lock")
    foreign.name = "LockAcquisitionError"

    await expect(
      deferOnLockContention(job, "token", () => Promise.reject(foreign)),
    ).rejects.toBeInstanceOf(DelayedError)
  })

  test("cannot defer without the worker token, so the error propagates", async () => {
    const job = makeJob()
    const error = lockError()

    await expect(
      deferOnLockContention(job, undefined, () => Promise.reject(error)),
    ).rejects.toBe(error)

    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  test("lets the error fail the attempt once the deferral budget is spent", async () => {
    const job = makeJob({
      attemptsStarted: LOCK_CONTENTION_POLICY.maxDeferrals + 1,
      attemptsMade: 0,
    })
    const error = lockError()

    await expect(
      deferOnLockContention(job, "token", () => Promise.reject(error)),
    ).rejects.toBe(error)

    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })
})
