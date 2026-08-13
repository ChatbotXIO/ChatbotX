import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// getRedisConnection reads keys() at module scope, so env must be stubbed
// before the module is imported and the module registry reset between cases.
const DEAD_REDIS_URL = "redis://127.0.0.1:6399"

describe("getRedisConnection during next build", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("REDIS_URL", DEAD_REDIS_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("does not dial Redis when NEXT_PHASE is phase-production-build", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build")

    const { getRedisConnection } = await import("../src/lib/connection")
    const connection = getRedisConnection()

    // lazyConnect keeps the socket untouched until the first command.
    expect(connection.status).toBe("wait")

    connection.disconnect()
  })

  test("connects eagerly outside the build phase", async () => {
    vi.stubEnv("NEXT_PHASE", "")

    const { getRedisConnection } = await import("../src/lib/connection")
    const connection = getRedisConnection()

    expect(connection.status).not.toBe("wait")

    connection.disconnect()
  })
})
