import { afterEach, describe, expect, test, vi } from "vitest"
import { resolveRealtimeRedisUrl } from "../src/platform/settings"

const REDIS_URL = "redis://localhost:6379"
const REDIS_REALTIME_URL = "redis://localhost:6380"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("resolveRealtimeRedisUrl", () => {
  test("uses REDIS_URL when REDIS_REALTIME_URL is unset", () => {
    vi.stubEnv("REDIS_URL", REDIS_URL)
    vi.stubEnv(
      "REALTIME_BROADCAST_SECRET",
      "test-secret-test-secret-test-secret",
    )
    vi.stubEnv("REDIS_REALTIME_URL", undefined)

    expect(resolveRealtimeRedisUrl()).toBe(REDIS_URL)
  })

  test("uses REDIS_REALTIME_URL when it is set", () => {
    vi.stubEnv("REDIS_URL", REDIS_URL)
    vi.stubEnv(
      "REALTIME_BROADCAST_SECRET",
      "test-secret-test-secret-test-secret",
    )
    vi.stubEnv("REDIS_REALTIME_URL", REDIS_REALTIME_URL)

    expect(resolveRealtimeRedisUrl()).toBe(REDIS_REALTIME_URL)
  })
})
