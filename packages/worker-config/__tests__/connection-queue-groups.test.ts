import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// getRedisConnection reads keys() at module scope, so env must be stubbed
// before the module is imported and the module registry reset between cases.
const DEAD_REDIS_URL = "redis://127.0.0.1:6399"
const DEAD_QUEUE_URL = "redis://127.0.0.1:6398"
const DEAD_BULK_URL = "redis://127.0.0.1:6397"

describe("getRedisConnection queue-group routing", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PHASE", "phase-production-build")
    vi.stubEnv("VITEST", "true")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("hot falls back to REDIS_QUEUE_URL then REDIS_URL, ignoring REDIS_QUEUE_BULK_URL", async () => {
    vi.stubEnv("REDIS_URL", DEAD_REDIS_URL)
    vi.stubEnv("REDIS_QUEUE_URL", DEAD_QUEUE_URL)
    vi.stubEnv("REDIS_QUEUE_BULK_URL", DEAD_BULK_URL)

    const { getRedisConnection } = await import("../src/lib/connection")
    const hot = getRedisConnection("hot")

    expect(hot.options.host).toBe("127.0.0.1")
    expect(hot.options.port).toBe(6398)

    hot.disconnect()
  })

  test("bulk uses REDIS_QUEUE_BULK_URL when set", async () => {
    vi.stubEnv("REDIS_URL", DEAD_REDIS_URL)
    vi.stubEnv("REDIS_QUEUE_URL", DEAD_QUEUE_URL)
    vi.stubEnv("REDIS_QUEUE_BULK_URL", DEAD_BULK_URL)

    const { getRedisConnection } = await import("../src/lib/connection")
    const bulk = getRedisConnection("bulk")

    expect(bulk.options.host).toBe("127.0.0.1")
    expect(bulk.options.port).toBe(6397)

    bulk.disconnect()
  })

  test("bulk falls back to the hot chain when REDIS_QUEUE_BULK_URL is unset", async () => {
    vi.stubEnv("REDIS_URL", DEAD_REDIS_URL)
    vi.stubEnv("REDIS_QUEUE_URL", DEAD_QUEUE_URL)
    // Leaving REDIS_QUEUE_BULK_URL un-stubbed (rather than "") is deliberate:
    // an empty string is a valid connection string to ioredis (it falls back
    // to its own default host/port), not the "unset" case this test needs —
    // z.url().optional() only treats a genuinely absent key as undefined.
    vi.stubEnv("REDIS_QUEUE_BULK_URL", undefined as unknown as string)

    const { getRedisConnection } = await import("../src/lib/connection")
    const bulk = getRedisConnection("bulk")

    expect(bulk.options.port).toBe(6398)

    bulk.disconnect()
  })

  test("hot and bulk are cached as distinct connection instances", async () => {
    vi.stubEnv("REDIS_URL", DEAD_REDIS_URL)
    vi.stubEnv("REDIS_QUEUE_URL", DEAD_QUEUE_URL)
    vi.stubEnv("REDIS_QUEUE_BULK_URL", DEAD_BULK_URL)

    const { getRedisConnection } = await import("../src/lib/connection")
    const hotFirst = getRedisConnection("hot")
    const hotSecond = getRedisConnection("hot")
    const bulk = getRedisConnection("bulk")

    expect(hotSecond).toBe(hotFirst)
    expect(bulk).not.toBe(hotFirst)

    hotFirst.disconnect()
    bulk.disconnect()
  })

  test("defaults to the hot group when no group is passed", async () => {
    vi.stubEnv("REDIS_URL", DEAD_REDIS_URL)
    vi.stubEnv("REDIS_QUEUE_URL", DEAD_QUEUE_URL)
    vi.stubEnv("REDIS_QUEUE_BULK_URL", DEAD_BULK_URL)

    const { getRedisConnection } = await import("../src/lib/connection")
    const defaultConnection = getRedisConnection()
    const hot = getRedisConnection("hot")

    expect(defaultConnection).toBe(hot)

    defaultConnection.disconnect()
  })
})
