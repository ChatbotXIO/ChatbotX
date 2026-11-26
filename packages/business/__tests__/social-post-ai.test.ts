import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findDestinations: vi.fn(),
  store: new Map<string, string>(),
}))

/** An in-memory stand-in for the Redis calls the guard makes. */
vi.mock("@chatbotx.io/redis", () => {
  const counters = new Map<string, number>()
  return {
    distributedStore: {
      claimKey: vi.fn((key: string, owner: string) => {
        if (mocks.store.has(key)) {
          return Promise.resolve(false)
        }
        mocks.store.set(key, owner)
        return Promise.resolve(true)
      }),
      delete: vi.fn((key: string) => {
        mocks.store.delete(key)
        return Promise.resolve()
      }),
      getKeyOwner: vi.fn((key: string) =>
        Promise.resolve(mocks.store.get(key) ?? null),
      ),
      incrWithWindow: vi.fn((key: string) => {
        const next = (counters.get(key) ?? 0) + 1
        counters.set(key, next)
        return Promise.resolve(next)
      }),
      put: vi.fn((key: string, value: unknown) => {
        mocks.store.set(key, JSON.stringify(value))
        return Promise.resolve()
      }),
      releaseKeyIfOwner: vi.fn((key: string, owner: string) => {
        if (mocks.store.get(key) === owner) {
          mocks.store.delete(key)
          return Promise.resolve(true)
        }
        return Promise.resolve(false)
      }),
    },
    invalidateCacheByTags: vi.fn(),
    __resetCounters: () => counters.clear(),
  }
})
vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostRepository: { findDestinations: mocks.findDestinations },
}))

const redis = await import("@chatbotx.io/redis")
const { ChatbotXException } = await import("../src/errors")
const {
  POST_AI_MAX_PER_DAY,
  POST_AI_MAX_PER_MINUTE,
  PostAiProviderFailure,
  clampToLimits,
  postTextLimitsFor,
  shortestLimit,
  socialPostAiService,
  stripControlCharacters,
} = await import("../src/social-post-ai")

const run = (
  overrides: Partial<Parameters<typeof socialPostAiService.generate>[0]> = {},
) =>
  socialPostAiService.generate({
    actorId: "member-1",
    idempotencyKey: "key-1",
    inputChars: 12,
    limits: [],
    prepare: async () => "model",
    produce: async () => "A fresh post",
    request: { mode: "write" },
    workspaceId: "ws-1",
    ...overrides,
  })

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise
  } catch (error) {
    return error instanceof ChatbotXException ||
      error instanceof PostAiProviderFailure
      ? error.code
      : "other"
  }
  return "none"
}

describe("socialPostAiService.generate", () => {
  beforeEach(() => {
    mocks.store.clear()
    ;(redis as unknown as { __resetCounters: () => void }).__resetCounters()
    vi.clearAllMocks()
  })

  test("replays the stored result for a repeated key without a second provider call", async () => {
    const produce = vi.fn(async () => "Hello world")

    const first = await run({ produce })
    const second = await run({ produce })

    expect(produce).toHaveBeenCalledTimes(1)
    expect(second).toEqual(first)
    expect(first.text).toBe("Hello world")
    expect(first.usage).toEqual({ inputChars: 12, outputChars: 11 })
  })

  test("replays a provider failure for 10 minutes without paying again", async () => {
    const produce = vi.fn(() =>
      Promise.reject(new PostAiProviderFailure("timeout")),
    )

    expect(await codeOf(run({ produce }))).toBe("timeout")
    expect(await codeOf(run({ produce }))).toBe("timeout")
    expect(produce).toHaveBeenCalledTimes(1)
  })

  test("refuses the same key with another request", async () => {
    await run()

    expect(await codeOf(run({ request: { mode: "rewrite" } }))).toBe(
      "aiKeyReused",
    )
  })

  test("answers 409 while the first call with the key still runs", async () => {
    let release: (text: string) => void = () => undefined
    const slow = run({
      produce: () => new Promise<string>((resolve) => (release = resolve)),
    })
    await vi.waitFor(() =>
      expect(redis.distributedStore.claimKey).toHaveBeenCalledTimes(2),
    )

    expect(await codeOf(run())).toBe("aiRequestInProgress")
    release("done")
    await slow
  })

  test("allows one call at a time per actor", async () => {
    let release: (text: string) => void = () => undefined
    const slow = run({
      produce: () => new Promise<string>((resolve) => (release = resolve)),
    })
    await vi.waitFor(() =>
      expect(redis.distributedStore.claimKey).toHaveBeenCalledTimes(2),
    )

    expect(await codeOf(run({ idempotencyKey: "key-2" }))).toBe(
      "aiRequestInProgress",
    )
    expect(
      await codeOf(run({ actorId: "member-2", idempotencyKey: "key-3" })),
    ).toBe("none")
    release("done")
    await slow
    // The guard is free again once the call ends.
    expect(await codeOf(run({ idempotencyKey: "key-4" }))).toBe("none")
  })

  test("refuses past the per-minute cap before the provider call and frees the key", async () => {
    const produce = vi.fn(async () => "text")
    vi.mocked(redis.distributedStore.incrWithWindow).mockResolvedValueOnce(
      POST_AI_MAX_PER_MINUTE + 1,
    )

    expect(await codeOf(run({ produce }))).toBe("aiRateLimited")
    expect(produce).not.toHaveBeenCalled()
    // The refused call stored nothing: the same key can be tried again.
    expect(await codeOf(run({ produce }))).toBe("none")
    expect(produce).toHaveBeenCalledTimes(1)
  })

  test("refuses past the per-day cap", async () => {
    const produce = vi.fn(async () => "text")
    vi.mocked(redis.distributedStore.incrWithWindow)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(POST_AI_MAX_PER_DAY + 1)

    expect(await codeOf(run({ produce }))).toBe("aiRateLimited")
    expect(produce).not.toHaveBeenCalled()
  })

  test("a precondition failure (no model configured) costs no cap and no call", async () => {
    const produce = vi.fn(async () => "text")
    const notConfigured = new ChatbotXException(
      "no model",
      "aiNotConfigured",
      409,
    )

    const code = await codeOf(
      run({
        prepare: () => Promise.reject(notConfigured),
        produce,
      }),
    )

    expect(code).toBe("aiNotConfigured")
    expect(produce).not.toHaveBeenCalled()
    expect(redis.distributedStore.incrWithWindow).not.toHaveBeenCalled()
    expect(mocks.store.size).toBe(0)
  })

  test("cuts the answer to the limit and says so", async () => {
    const result = await run({
      limits: [{ limit: 10, provider: "instagram" }],
      produce: () => Promise.resolve("A very long suggestion indeed"),
    })

    expect(result.text).toBe("A very lon")
    expect(result.truncated).toBe(true)
    expect(result.limit).toBe(10)
    expect(result.usage.outputChars).toBe(10)
  })

  test("counts Threads emoji by their UTF-8 bytes when cutting", async () => {
    // Each emoji is 4 UTF-8 bytes on Threads: 3 of them fit in 12.
    const result = await run({
      limits: [{ limit: 12, provider: "threads" }],
      produce: () => Promise.resolve("😀😀😀😀😀"),
    })

    expect(result.text).toBe("😀😀😀")
    expect(result.truncated).toBe(true)
  })

  test("fits every network at once", async () => {
    const result = await run({
      limits: [
        { limit: 8, provider: "instagram" },
        { limit: 20, provider: "threads" },
      ],
      produce: () => Promise.resolve("abcdefghijklmnop"),
    })

    expect(result.text).toBe("abcdefgh")
  })

  test("clamps each per-network variant to its own network and sums the usage", async () => {
    const result = await run({
      limits: [
        { limit: 5, provider: "threads" },
        { limit: 20, provider: "instagram" },
      ],
      produce: () =>
        Promise.resolve({
          variants: [
            { provider: "threads", text: "abcdefghij" },
            { provider: "instagram", text: "abcdefghij" },
            { text: "  " },
          ],
        }),
    })

    expect(result.variants).toEqual([
      { limit: 5, provider: "threads", text: "abcde", truncated: true },
      {
        limit: 20,
        provider: "instagram",
        text: "abcdefghij",
        truncated: false,
      },
    ])
    expect(result.text).toBe("abcde")
    expect(result.truncated).toBe(true)
    expect(result.usage.outputChars).toBe(15)
  })

  test("a hashtags-only draft is a result, an empty draft is not", async () => {
    const tags = await run({
      produce: () => Promise.resolve({ hashtags: ["#a", "#b"], variants: [] }),
    })
    expect(tags.hashtags).toEqual(["#a", "#b"])
    expect(tags.variants).toEqual([])
    expect(
      await codeOf(
        run({
          idempotencyKey: "key-empty",
          produce: () => Promise.resolve({ variants: [] }),
        }),
      ),
    ).toBe("emptyOutput")
  })

  test("a plain string answer is still one variant", async () => {
    const result = await run({ produce: () => Promise.resolve("Hello") })
    expect(result.variants).toEqual([
      { limit: null, provider: null, text: "Hello", truncated: false },
    ])
    expect(result.hashtags).toEqual([])
  })

  test("an empty answer is a provider failure, not an empty post", async () => {
    expect(await codeOf(run({ produce: async () => " \u0007 " }))).toBe(
      "emptyOutput",
    )
  })
})

describe("text limits", () => {
  test("lists each network's own limit and leaves out one with none documented", () => {
    const limits = postTextLimitsFor(["threads", "instagram", "facebook"])

    expect(limits.map((item) => item.provider)).toEqual([
      "threads",
      "instagram",
    ])
    expect(shortestLimit(limits)).toBe(
      Math.min(...limits.map((item) => item.limit)),
    )
    expect(postTextLimitsFor(["facebook"])).toEqual([])
    expect(shortestLimit([])).toBeNull()
  })

  test("does not split a surrogate pair when cutting", () => {
    expect(
      clampToLimits("ab😀cd", [{ limit: 3, provider: "instagram" }]),
    ).toEqual({ text: "ab", truncated: true })
  })

  test("leaves a text within the limit alone", () => {
    expect(
      clampToLimits("short", [{ limit: 10, provider: "instagram" }]),
    ).toEqual({ text: "short", truncated: false })
    expect(clampToLimits("anything", []).truncated).toBe(false)
  })

  test("removes control characters but keeps line feeds and tabs", () => {
    expect(stripControlCharacters("a\u0000b\tc\nd\u007fe")).toBe("ab\tc\nde")
  })
})

describe("socialPostAiService.limitsForDestinations", () => {
  test("is empty with no destination and refuses one that is not in the workspace", async () => {
    expect(
      await socialPostAiService.limitsForDestinations({
        destinationIds: [],
        workspaceId: "ws-1",
      }),
    ).toEqual([])

    mocks.findDestinations.mockResolvedValue([])
    await expect(
      socialPostAiService.limitsForDestinations({
        destinationIds: ["9"],
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("A destination was not found")
  })

  test("takes the limit from the networks of the destinations", async () => {
    mocks.findDestinations.mockResolvedValue([
      { id: "1", provider: "threads" },
      { id: "2", provider: "instagram" },
    ])

    expect(
      await socialPostAiService.limitsForDestinations({
        destinationIds: ["1", "2"],
        workspaceId: "ws-1",
      }),
    ).toEqual(postTextLimitsFor(["threads", "instagram"]))
  })
})
