import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type ProbeArgs = { timeoutMs: number; signal: AbortSignal }

const mocks = vi.hoisted(() => ({
  pingDatabase: vi.fn<(args: ProbeArgs) => Promise<void>>(),
  pingRedis: vi.fn<(args: ProbeArgs) => Promise<void>>(),
}))

vi.mock("@chatbotx.io/database/repositories/health", () => ({
  pingDatabase: mocks.pingDatabase,
}))
vi.mock("@chatbotx.io/redis/probe", () => ({
  pingRedis: mocks.pingRedis,
}))

const { checkReadiness, READINESS_CHECK_TIMEOUT_MS } = await import(
  "../src/health/health.service"
)

/** A probe that hangs until its signal aborts, like a dead dependency. */
const hangUntilAborted = ({ signal }: ProbeArgs) =>
  new Promise<void>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    })
  })

describe("checkReadiness", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.pingDatabase.mockReset().mockResolvedValue(undefined)
    mocks.pingRedis.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("reports both dependencies ready", async () => {
    await expect(checkReadiness()).resolves.toEqual({ db: true, redis: true })
    expect(mocks.pingDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: READINESS_CHECK_TIMEOUT_MS }),
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  test("reports a failing database", async () => {
    mocks.pingDatabase.mockRejectedValue(new Error("connection refused"))

    await expect(checkReadiness()).resolves.toEqual({ db: false, redis: true })
  })

  test("reports Redis not ready when it does not reply within 2 seconds", async () => {
    mocks.pingRedis.mockImplementation(hangUntilAborted)

    const result = checkReadiness()
    await vi.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS)

    await expect(result).resolves.toEqual({ db: true, redis: false })
    const { signal } = mocks.pingRedis.mock.calls[0][0]
    expect(signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  test("reports a database timeout and a Redis error within the deadline", async () => {
    mocks.pingDatabase.mockImplementation(hangUntilAborted)
    mocks.pingRedis.mockRejectedValue(new Error("ECONNREFUSED"))

    const result = checkReadiness()
    await vi.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS)

    await expect(result).resolves.toEqual({ db: false, redis: false })
    expect(mocks.pingDatabase.mock.calls[0][0].signal.aborted).toBe(true)
  })

  test("runs the checks in parallel, not one after the other", async () => {
    mocks.pingDatabase.mockImplementation(hangUntilAborted)
    mocks.pingRedis.mockImplementation(hangUntilAborted)

    const result = checkReadiness()
    await vi.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS)

    await expect(result).resolves.toEqual({ db: false, redis: false })
  })

  test("shares one in-flight check between concurrent callers", async () => {
    mocks.pingRedis.mockImplementation(hangUntilAborted)

    const results = Array.from({ length: 20 }, () => checkReadiness())
    await vi.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS)

    expect(new Set(results).size).toBe(1)
    await expect(results[0]).resolves.toEqual({ db: true, redis: false })
    expect(mocks.pingDatabase).toHaveBeenCalledTimes(1)
    expect(mocks.pingRedis).toHaveBeenCalledTimes(1)
  })

  test("does not accumulate timers across repeated timeouts and recovers", async () => {
    mocks.pingRedis.mockImplementation(hangUntilAborted)

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = checkReadiness()
      await vi.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS)
      await expect(result).resolves.toEqual({ db: true, redis: false })
      expect(vi.getTimerCount()).toBe(0)
    }
    for (const [{ signal }] of mocks.pingRedis.mock.calls) {
      expect(signal.aborted).toBe(true)
    }

    mocks.pingRedis.mockResolvedValue(undefined)
    await expect(checkReadiness()).resolves.toEqual({ db: true, redis: true })
  })
})
