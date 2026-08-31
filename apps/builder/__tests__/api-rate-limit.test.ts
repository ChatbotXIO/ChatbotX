// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: {
    incrementCounter: vi.fn(),
    setNumberIfNotExists: vi.fn(),
  },
}))

const { checkApiRateLimit, assertApiNotRateLimited } = await import(
  "../src/lib/rate-limit/api-rate-limit"
)

const WINDOW_MS = 10_000
const REQUEST_LIMIT = 120

function createFakeStore() {
  const counters = new Map<string, number>()
  return {
    counters,
    setNumberIfNotExists: vi.fn((key: string, value: number) => {
      if (counters.has(key)) {
        return Promise.resolve(false)
      }
      counters.set(key, value)
      return Promise.resolve(true)
    }),
    incrementCounter: vi.fn((key: string, by: number) => {
      const next = (counters.get(key) ?? 0) + by
      counters.set(key, next)
      return Promise.resolve(next)
    }),
  }
}

describe("checkApiRateLimit", () => {
  let store: ReturnType<typeof createFakeStore>

  beforeEach(() => {
    store = createFakeStore()
  })

  test("counts requests within the fixed window and reports retryAfter", async () => {
    const now = 0
    const result = await checkApiRateLimit({
      scope: "channel-api-rate-limit",
      key: "inbox-1",
      store,
      now,
    })

    expect(result.limited).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
    expect(store.setNumberIfNotExists).toHaveBeenCalledTimes(1)
  })

  test("limits once the count exceeds REQUEST_LIMIT within the same window", async () => {
    const now = 0
    await Promise.all(
      Array.from({ length: REQUEST_LIMIT }, () =>
        checkApiRateLimit({
          scope: "channel-api-rate-limit",
          key: "inbox-2",
          store,
          now,
        }),
      ),
    )

    const result = await checkApiRateLimit({
      scope: "channel-api-rate-limit",
      key: "inbox-2",
      store,
      now,
    })

    expect(result.limited).toBe(true)
  })

  test("scope isolation: the same key under different scopes gets independent counters", async () => {
    const now = 0
    await Promise.all(
      Array.from({ length: REQUEST_LIMIT }, () =>
        checkApiRateLimit({
          scope: "channel-api-rate-limit",
          key: "shared-key",
          store,
          now,
        }),
      ),
    )

    const channelResult = await checkApiRateLimit({
      scope: "channel-api-rate-limit",
      key: "shared-key",
      store,
      now,
    })
    const workspaceResult = await checkApiRateLimit({
      scope: "workspace-token-rate-limit",
      key: "shared-key",
      store,
      now,
    })

    expect(channelResult.limited).toBe(true)
    expect(workspaceResult.limited).toBe(false)
  })

  test("a new window resets the counter", async () => {
    await Promise.all(
      Array.from({ length: REQUEST_LIMIT }, () =>
        checkApiRateLimit({
          scope: "channel-api-rate-limit",
          key: "inbox-3",
          store,
          now: 0,
        }),
      ),
    )

    const nextWindowResult = await checkApiRateLimit({
      scope: "channel-api-rate-limit",
      key: "inbox-3",
      store,
      now: WINDOW_MS,
    })

    expect(nextWindowResult.limited).toBe(false)
  })

  test("falls back to the in-memory counter when the store throws", async () => {
    const failingStore = {
      setNumberIfNotExists: vi.fn().mockRejectedValue(new Error("redis down")),
      incrementCounter: vi.fn().mockRejectedValue(new Error("redis down")),
    }

    const result = await checkApiRateLimit({
      scope: "channel-api-rate-limit",
      key: "fallback-key",
      store: failingStore,
      now: 0,
    })

    expect(result.limited).toBe(false)
  })

  test("the in-memory fallback still enforces the limit once the store is down", async () => {
    const failingStore = {
      setNumberIfNotExists: vi.fn().mockRejectedValue(new Error("redis down")),
      incrementCounter: vi.fn().mockRejectedValue(new Error("redis down")),
    }

    const results = await Promise.all(
      Array.from({ length: REQUEST_LIMIT + 1 }, () =>
        checkApiRateLimit({
          scope: "channel-api-rate-limit",
          key: "fallback-key-2",
          store: failingStore,
          now: 0,
        }),
      ),
    )

    expect(results.at(-1)?.limited).toBe(true)
  })

  test("expired fallback entries are evicted instead of accumulating forever", async () => {
    const { memoryCounters } = await import(
      "../src/lib/rate-limit/api-rate-limit"
    )
    const failingStore = {
      setNumberIfNotExists: vi.fn().mockRejectedValue(new Error("redis down")),
      incrementCounter: vi.fn().mockRejectedValue(new Error("redis down")),
    }
    // Far in the future so this test's clock outruns any sweep scheduled by
    // earlier fallback tests (module-level state), letting the sweep run.
    const base = Date.now() + 86_400_000
    vi.useFakeTimers()
    try {
      vi.setSystemTime(base)
      await checkApiRateLimit({
        scope: "channel-api-rate-limit",
        key: "evict-old",
        store: failingStore,
        now: base,
      })
      expect(
        [...memoryCounters.keys()].some((key) => key.includes("evict-old")),
      ).toBe(true)

      // Two windows later the first entry is expired; the next fallback hit
      // must sweep it out rather than leave it behind for good.
      vi.setSystemTime(base + 2 * WINDOW_MS)
      await checkApiRateLimit({
        scope: "channel-api-rate-limit",
        key: "evict-new",
        store: failingStore,
        now: base + 2 * WINDOW_MS,
      })
      expect(
        [...memoryCounters.keys()].some((key) => key.includes("evict-old")),
      ).toBe(false)
      expect(
        [...memoryCounters.keys()].some((key) => key.includes("evict-new")),
      ).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("assertApiNotRateLimited", () => {
  let store: ReturnType<typeof createFakeStore>

  beforeEach(() => {
    store = createFakeStore()
  })

  test("resolves without throwing when not limited", async () => {
    await expect(
      assertApiNotRateLimited({
        scope: "channel-api-rate-limit",
        key: "inbox-ok",
        store,
        now: 0,
      }),
    ).resolves.toBeUndefined()
  })

  test("throws a tooManyRequests exception with a 429 status when limited", async () => {
    await Promise.all(
      Array.from({ length: REQUEST_LIMIT }, () =>
        checkApiRateLimit({
          scope: "channel-api-rate-limit",
          key: "inbox-limited",
          store,
          now: 0,
        }),
      ),
    )

    await expect(
      assertApiNotRateLimited({
        scope: "channel-api-rate-limit",
        key: "inbox-limited",
        store,
        now: 0,
      }),
    ).rejects.toMatchObject({
      code: "tooManyRequests",
      httpStatusCode: 429,
    })
  })
})
