import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// getOrRevalidate / invalidateMessagingAdsCache — the stale-while-revalidate
// cache over Graph reads (out/plan/ctwa-ctm-ctid-box-merge.md Phase 2, v3
// correction #7/#8). Fakes `@chatbotx.io/redis`'s cache primitives with a
// simple in-memory store (not the real Redis client) so cache-hit/stale/
// miss/invalidation/generation-race behavior is asserted deterministically —
// mirrors `packages/redis/__tests__/cache-utils.test.ts`'s approach of
// exercising real cache SEMANTICS against a fake backing store, rather than
// mocking `getOrRevalidate` itself.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  const tagIndex = new Map<string, Set<string>>()
  const generationStore = new Map<string, number>()

  return {
    store,
    tagIndex,
    generationStore,
    withCache: vi.fn(
      async (
        key: string,
        fn: () => Promise<unknown>,
        options?: { tags?: string[] },
      ) => {
        if (store.has(key)) {
          return store.get(key)
        }
        const result = await fn()
        if (result === null || result === undefined) {
          return result
        }
        store.set(key, result)
        for (const tag of options?.tags ?? []) {
          if (!tagIndex.has(tag)) {
            tagIndex.set(tag, new Set())
          }
          tagIndex.get(tag)?.add(key)
        }
        return result
      },
    ),
    invalidateCacheKeys: vi.fn((keys: string | string[]) => {
      const keysArray = Array.isArray(keys) ? keys : [keys]
      for (const key of keysArray) {
        store.delete(key)
      }
      return Promise.resolve()
    }),
    invalidateCacheByTags: vi.fn((tags: string[]) => {
      for (const tag of tags) {
        const keys = tagIndex.get(tag) ?? new Set()
        for (const key of keys) {
          store.delete(key)
        }
        tagIndex.delete(tag)
      }
      return Promise.resolve()
    }),
    distributedLock: {
      runExclusive: vi.fn(({ fn }: { fn: () => Promise<unknown> }) => fn()),
    },
    distributedStore: {
      getNumber: vi.fn((key: string) =>
        Promise.resolve(generationStore.get(key) ?? null),
      ),
      setNumber: vi.fn((key: string, value: number) => {
        generationStore.set(key, value)
        return Promise.resolve()
      }),
      // Real semantics: seed only when absent (NX).
      setNumberIfNotExists: vi.fn((key: string, value: number) => {
        if (generationStore.has(key)) {
          return Promise.resolve(false)
        }
        generationStore.set(key, value)
        return Promise.resolve(true)
      }),
      // Real semantics: atomic increment, no-op (null) when the key is absent.
      incrementCounter: vi.fn((key: string, delta: number) => {
        if (!generationStore.has(key)) {
          return Promise.resolve(null)
        }
        const next = (generationStore.get(key) ?? 0) + delta
        generationStore.set(key, next)
        return Promise.resolve(next)
      }),
    },
  }
})

vi.mock("@chatbotx.io/redis", () => ({
  withCache: mocks.withCache,
  invalidateCacheKeys: mocks.invalidateCacheKeys,
  invalidateCacheByTags: mocks.invalidateCacheByTags,
  distributedLock: mocks.distributedLock,
  distributedStore: mocks.distributedStore,
}))

vi.mock("../../logger", () => ({
  logger: { error: vi.fn() },
}))

const { getOrRevalidate, invalidateMessagingAdsCache, messagingAdsCacheTag } =
  await import("../graph-cache")

beforeEach(() => {
  mocks.store.clear()
  mocks.tagIndex.clear()
  mocks.generationStore.clear()
  vi.clearAllMocks()
})

const baseInput = {
  key: "msgads:ad-accounts:whatsapp:iw_1",
  scope: "whatsapp:iw_1",
  ttlSeconds: 3600,
  staleAfterSeconds: 60,
  tags: [messagingAdsCacheTag("whatsapp:iw_1")],
}

describe("getOrRevalidate", () => {
  test("cold miss fetches synchronously and caches the result", async () => {
    const fetch = vi.fn(async () => ({ accounts: ["act_1"] }))

    const result = await getOrRevalidate({ ...baseInput, fetch })

    expect(result).toEqual({ accounts: ["act_1"] })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test("serves the cached value on a fresh (not-yet-stale) hit without refetching", async () => {
    const fetch = vi.fn(async () => ({ accounts: ["act_1"] }))
    await getOrRevalidate({ ...baseInput, fetch })

    const result = await getOrRevalidate({ ...baseInput, fetch })

    expect(result).toEqual({ accounts: ["act_1"] })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test("near-expiry: serves the stale cached value immediately and refreshes in the background", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ accounts: ["act_1"] })
      .mockResolvedValueOnce({ accounts: ["act_1", "act_2"] })
    // staleAfterSeconds: 0 — the entry is "stale" the instant it's read back.
    const input = { ...baseInput, staleAfterSeconds: 0, fetch }
    await getOrRevalidate(input)

    const result = await getOrRevalidate(input)

    // Still the FIRST value — the refresh is fired but not awaited.
    expect(result).toEqual({ accounts: ["act_1"] })
    // Let the detached background refresh's microtasks settle.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mocks.store.get(baseInput.key)).toMatchObject({
      value: { accounts: ["act_1", "act_2"] },
    })
  })

  test("a failed background refresh is caught and logged, never thrown into the request path", async () => {
    const { logger } = await import("../../logger")
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ accounts: ["act_1"] })
      .mockRejectedValueOnce(new Error("Graph timeout"))
    const input = { ...baseInput, staleAfterSeconds: 0, fetch }
    await getOrRevalidate(input)

    const result = await getOrRevalidate(input)
    expect(result).toEqual({ accounts: ["act_1"] })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(logger.error).toHaveBeenCalled()
  })

  test("forceRefresh always re-fetches even when the cache is fresh", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ accounts: ["act_1"] })
      .mockResolvedValueOnce({ accounts: ["act_1", "act_2"] })
    await getOrRevalidate({ ...baseInput, fetch })

    const result = await getOrRevalidate({
      ...baseInput,
      fetch,
      forceRefresh: true,
    })

    expect(result).toEqual({ accounts: ["act_1", "act_2"] })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe("invalidateMessagingAdsCache", () => {
  test("clears every tagged entry for the scope and bumps the generation", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ accounts: ["act_1"] })
      .mockResolvedValueOnce({ accounts: ["act_2"] })
    await getOrRevalidate({ ...baseInput, fetch })

    await invalidateMessagingAdsCache(baseInput.scope)

    expect(mocks.store.has(baseInput.key)).toBe(false)
    const generationKey = `msgads:gen:${baseInput.scope}`
    expect(mocks.generationStore.get(generationKey)).toBe(1)

    const result = await getOrRevalidate({ ...baseInput, fetch })
    expect(result).toEqual({ accounts: ["act_2"] })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  test("generation guard: a background refresh that resolves AFTER an invalidation does not resurrect stale data", async () => {
    let resolveSecondFetch: (value: { accounts: string[] }) => void = () => {
      // reassigned below
    }
    const secondFetchPromise = new Promise<{ accounts: string[] }>(
      (resolve) => {
        resolveSecondFetch = resolve
      },
    )
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ accounts: ["act_1"] })
      .mockReturnValueOnce(secondFetchPromise)
    const input = { ...baseInput, staleAfterSeconds: 0, fetch }

    // Populate the cache, then read it back once — this is "stale", which
    // fires the background refresh (held open on `secondFetchPromise`).
    await getOrRevalidate(input)
    await getOrRevalidate(input)

    // An invalidation (e.g. a mutation) lands WHILE the background refresh's
    // Graph call is still in flight.
    await invalidateMessagingAdsCache(baseInput.scope)
    expect(mocks.store.has(baseInput.key)).toBe(false)

    // Now the in-flight refresh's Graph call finally resolves with data
    // fetched against the PRE-invalidation generation.
    resolveSecondFetch({ accounts: ["act_1", "stale-during-race"] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The stale in-flight result must NOT have been written back — the
    // cache stays empty (a later reader recomputes cleanly).
    expect(mocks.store.has(baseInput.key)).toBe(false)
  })
})
