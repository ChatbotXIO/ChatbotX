import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  findPace: vi.fn(),
  listPublishedSince: vi.fn(),
  release: vi.fn(),
  reservePublishSlot: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  socialPostPaceRepository: {
    findPace: mocks.findPace,
    listPublishedSince: mocks.listPublishedSince,
    reservePublishSlot: mocks.reservePublishSlot,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  concurrencySlots: { acquire: mocks.acquire, release: mocks.release },
  // The cache is transparent here: every call reads the source.
  withCache: async (_key: string, fn: () => Promise<unknown>) => await fn(),
}))
vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const { checkPace, replyQuotaDeferral } = await import(
  "../src/social-post/publish-pace"
)
const { deleteQuotaExhausted } = await import(
  "../src/social-post/publish-delete-quota"
)

const NOW = new Date("2026-01-01T12:00:00Z")
const MINUTE = 60_000
const HOUR = 60 * MINUTE

const input = (
  overrides: {
    provider?: "facebook" | "instagram" | "threads" | "tiktok"
    contentType?: string
    getPublishingLimit?: () => Promise<unknown>
  } = {},
) => ({
  accessToken: "token",
  destinationExternalId: "ext-1",
  now: NOW,
  publisher: overrides.getPublishingLimit
    ? { getPublishingLimit: overrides.getPublishingLimit as never }
    : {},
  random: () => 0.5,
  target: {
    contentType: (overrides.contentType ?? "text") as never,
    destinationId: "dest-1",
    id: "t-1",
    provider: overrides.provider ?? "facebook",
    workspaceId: "ws-1",
  },
})

describe("the pace gate", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.findPace.mockResolvedValue({
      lastPublishStartedAt: null,
      pausedUntil: null,
      pauseReason: null,
    })
    mocks.listPublishedSince.mockResolvedValue([])
    mocks.acquire.mockResolvedValue(true)
    mocks.release.mockResolvedValue(undefined)
    mocks.reservePublishSlot.mockResolvedValue(true)
  })

  test("lets a quiet destination through and books its slot with the network's gap", async () => {
    const decision = await checkPace(input({ provider: "instagram" }))

    expect(decision.kind).toBe("go")
    expect(mocks.reservePublishSlot).toHaveBeenCalledWith({
      destinationId: "dest-1",
      gapMs: 10 * MINUTE,
      now: NOW,
      workspaceId: "ws-1",
    })
  })

  test.each([
    ["facebook", 5],
    ["instagram", 10],
    ["threads", 5],
    ["tiktok", 15],
  ] as const)("%s keeps a %d minute gap", async (provider, minutes) => {
    await checkPace(input({ provider }))
    expect(mocks.reservePublishSlot).toHaveBeenCalledWith(
      expect.objectContaining({ gapMs: minutes * MINUTE }),
    )
  })

  test("a publish that started inside the gap defers to last + gap + jitter, giving the provider slot back", async () => {
    mocks.reservePublishSlot.mockResolvedValue(false)
    const last = new Date(NOW.getTime() - 2 * MINUTE)
    mocks.findPace.mockResolvedValue({
      lastPublishStartedAt: last,
      pausedUntil: null,
      pauseReason: null,
    })

    const decision = await checkPace(input({ provider: "facebook" }))

    // random 0.5 of 90 s = 45 s
    expect(decision).toEqual({
      kind: "defer",
      reason: "spacing",
      until: new Date(last.getTime() + 5 * MINUTE + 45_000),
    })
    expect(mocks.release).toHaveBeenCalledWith({
      holder: "t-1",
      key: "post-publish:slots:facebook",
    })
  })

  test("reservePublishSlot throws: the provider slot is released and the error rethrown", async () => {
    mocks.reservePublishSlot.mockRejectedValue(new Error("db blip"))

    await expect(checkPace(input({ provider: "tiktok" }))).rejects.toThrow(
      "db blip",
    )

    expect(mocks.release).toHaveBeenCalledWith({
      holder: "t-1",
      key: "post-publish:slots:tiktok",
    })
  })

  test("two workers racing for one destination: the guarded update lets one through, the other defers", async () => {
    // The repository's conditional UPDATE answers one row to the first caller
    // and none to the second, however many run at once.
    mocks.reservePublishSlot
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    mocks.findPace.mockResolvedValue({
      lastPublishStartedAt: NOW,
      pausedUntil: null,
      pauseReason: null,
    })

    const [first, second] = await Promise.all([
      checkPace(input()),
      checkPace(input()),
    ])

    expect([first.kind, second.kind].sort()).toEqual(["defer", "go"])
  })

  test("a paused destination defers every target to the end of the pause, touching nothing", async () => {
    const pausedUntil = new Date(NOW.getTime() + 5 * HOUR)
    mocks.findPace.mockResolvedValue({
      lastPublishStartedAt: null,
      pausedUntil,
      pauseReason: "limitReached",
    })

    const decision = await checkPace(input())

    expect(decision).toEqual({
      kind: "defer",
      reason: "paused",
      until: pausedUntil,
    })
    expect(mocks.acquire).not.toHaveBeenCalled()
    expect(mocks.reservePublishSlot).not.toHaveBeenCalled()
  })

  test("a pause that already ended no longer defers", async () => {
    mocks.findPace.mockResolvedValue({
      lastPublishStartedAt: null,
      pausedUntil: new Date(NOW.getTime() - HOUR),
      pauseReason: "limitReached",
    })
    expect((await checkPace(input())).kind).toBe("go")
  })

  test("a full provider defers 30 to 60 seconds and takes no spacing slot", async () => {
    mocks.acquire.mockResolvedValue(false)

    const decision = await checkPace(input({ provider: "tiktok" }))

    expect(decision).toEqual({
      kind: "defer",
      reason: "providerBusy",
      until: new Date(NOW.getTime() + 45_000),
    })
    expect(mocks.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ key: "post-publish:slots:tiktok", limit: 1 }),
    )
    expect(mocks.reservePublishSlot).not.toHaveBeenCalled()
  })

  test("Redis down: the provider slot check fails open", async () => {
    mocks.acquire.mockRejectedValue(new Error("redis down"))
    expect((await checkPace(input())).kind).toBe("go")
  })

  describe("the rolling 24 hour cap", () => {
    const publishedAt = (count: number) =>
      Array.from(
        { length: count },
        (_, index) => new Date(NOW.getTime() - (23 - index * 0.5) * HOUR),
      )

    test("Facebook feed posts: defers to when the oldest counted publish leaves the window (own default 25)", async () => {
      const published = publishedAt(25)
      mocks.listPublishedSince.mockResolvedValue(published)

      const decision = await checkPace(input({ provider: "facebook" }))

      expect(decision).toEqual({
        kind: "defer",
        reason: "dailyCap",
        until: new Date(published[0].getTime() + 24 * HOUR),
      })
      expect(mocks.reservePublishSlot).not.toHaveBeenCalled()
    })

    test("Facebook feed posts and Reels are counted apart (Reels: official 30)", async () => {
      mocks.listPublishedSince.mockResolvedValue(publishedAt(26))
      const reel = await checkPace(
        input({ contentType: "reel", provider: "facebook" }),
      )
      expect(reel.kind).toBe("go")
      expect(mocks.listPublishedSince).toHaveBeenCalledWith(
        expect.objectContaining({ contentTypes: ["reel"] }),
      )
    })

    test("TikTok: own default 15 a day", async () => {
      mocks.listPublishedSince.mockResolvedValue(publishedAt(15))
      expect((await checkPace(input({ provider: "tiktok" }))).kind).toBe(
        "defer",
      )
    })

    test("Instagram: the live content_publishing_limit wins over the fallback", async () => {
      mocks.listPublishedSince.mockResolvedValue(publishedAt(60))
      // Live total 100, our own count 60: under the live cap.
      const live = vi
        .fn()
        .mockResolvedValue({ quotaTotal: 100, quotaUsage: 60 })
      const decision = await checkPace(
        input({ getPublishingLimit: live, provider: "instagram" }),
      )
      expect(decision.kind).toBe("go")
      expect(live).toHaveBeenCalledWith({
        accessToken: "token",
        destinationExternalId: "ext-1",
      })
    })

    test("Instagram: live usage at the live total defers even when our own count is lower", async () => {
      mocks.listPublishedSince.mockResolvedValue(publishedAt(3))
      const live = vi.fn().mockResolvedValue({ quotaTotal: 50, quotaUsage: 50 })
      const decision = await checkPace(
        input({ getPublishingLimit: live, provider: "instagram" }),
      )
      expect(decision.kind).toBe("defer")
    })

    test("Instagram: the call failing falls back to 50, the conservative of the two documented numbers", async () => {
      mocks.listPublishedSince.mockResolvedValue(publishedAt(50))
      const live = vi.fn().mockResolvedValue(null)
      const decision = await checkPace(
        input({ getPublishingLimit: live, provider: "instagram" }),
      )
      expect(decision).toMatchObject({ kind: "defer", reason: "dailyCap" })
    })

    test("Threads: falls back to the documented 250 when the endpoint throws", async () => {
      mocks.listPublishedSince.mockResolvedValue(publishedAt(249))
      const live = vi.fn().mockRejectedValue(new Error("boom"))
      const decision = await checkPace(
        input({ getPublishingLimit: live, provider: "threads" }),
      )
      expect(decision.kind).toBe("go")
    })
  })
})

describe("the Threads reply and delete quotas", () => {
  const reply = (usage: number, total = 1000) =>
    vi.fn(async () => ({ quotaTotal: total, quotaUsage: usage }))
  const replyInput = (getReplyLimit?: () => Promise<unknown>) => ({
    accessToken: "token",
    destinationExternalId: "ext-1",
    destinationId: "dest-1",
    now: NOW,
    publisher: getReplyLimit ? { getReplyLimit: getReplyLimit as never } : {},
  })

  test("a reply is deferred an hour when the reply quota is used up", async () => {
    expect(await replyQuotaDeferral(replyInput(reply(1000)))).toEqual(
      new Date(NOW.getTime() + HOUR),
    )
  })

  test("a reply goes ahead with room, with no reader or when the read fails", async () => {
    expect(await replyQuotaDeferral(replyInput(reply(999)))).toBeNull()
    expect(await replyQuotaDeferral(replyInput())).toBeNull()
    expect(
      await replyQuotaDeferral(
        replyInput(() => Promise.reject(new Error("down"))),
      ),
    ).toBeNull()
    expect(await replyQuotaDeferral(replyInput(async () => null))).toBeNull()
  })

  test("a delete is refused only when the delete quota is used up", async () => {
    const base = { accessToken: "t", destinationExternalId: "ext-1" }
    expect(
      await deleteQuotaExhausted({
        ...base,
        publisher: { getDeleteLimit: reply(100, 100) },
      }),
    ).toBe(true)
    expect(
      await deleteQuotaExhausted({
        ...base,
        publisher: { getDeleteLimit: reply(99, 100) },
      }),
    ).toBe(false)
    expect(await deleteQuotaExhausted({ ...base, publisher: {} })).toBe(false)
    expect(
      await deleteQuotaExhausted({
        ...base,
        publisher: { getDeleteLimit: async () => null },
      }),
    ).toBe(false)
  })
})
