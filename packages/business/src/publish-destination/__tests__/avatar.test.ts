import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  AVATAR_ENQUEUE_MAX_PER_CALL,
  AVATAR_REFRESH_AFTER_MS,
  AVATAR_RETRY_AFTER_MS,
  type AvatarOps,
  avatarJobId,
  isAvatarStale,
  publishDestinationAvatarService,
} from "../avatar"

const WORKSPACE = "w1"
const DESTINATION = "d1"
const TOKEN = "EAAB-super-secret-page-token"
const NOW = new Date("2026-11-23T10:00:00.000Z")

const mocks = vi.hoisted(() => ({
  loadPublishCredentials: vi.fn(),
  findState: vi.fn(),
  logWarn: vi.fn(),
  lowAdd: vi.fn(async (..._args: unknown[]) => undefined),
  recordAvatarFetch: vi.fn(async (..._args: unknown[]) => true),
  uploadFileFromUrl: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  publishDestinationRepository: { recordAvatarFetch: mocks.recordAvatarFetch },
  publishDestinationStateRepository: { findById: mocks.findState },
}))
vi.mock("@chatbotx.io/filesystem", () => ({
  UploadValidationError: class UploadValidationError extends Error {},
  uploadFileFromUrl: mocks.uploadFileFromUrl,
}))
vi.mock("@chatbotx.io/logger", () => ({
  toLogSafeError: (err: unknown) => ({
    message: String(err instanceof Error ? err.message : err).replaceAll(
      "EAAB-super-secret-page-token",
      "[redacted]",
    ),
  }),
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  LowJobAction: {
    refreshPublishDestinationAvatar: "refreshPublishDestinationAvatar",
  },
  lowQueue: { add: mocks.lowAdd },
}))
vi.mock("../credentials", () => ({
  loadPublishCredentials: mocks.loadPublishCredentials,
}))
vi.mock("../../logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: mocks.logWarn },
}))

const inboxCredentials = (publisherKey = "facebook") => ({
  credentials: {
    accessToken: TOKEN,
    destinationExternalId: "page-1",
    fence: { kind: "inbox" },
    publisherKey,
  },
  ok: true,
})

const makeOps = (impl: AvatarOps["fetchPictureUrl"]): AvatarOps => ({
  fetchPictureUrl: vi.fn(impl),
})

const input = { publishDestinationId: DESTINATION, workspaceId: WORKSPACE }

describe("publishDestinationAvatarService.refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadPublishCredentials.mockResolvedValue(inboxCredentials())
  })

  test("re-hosts the picture and stores the path", async () => {
    mocks.uploadFileFromUrl.mockResolvedValue({
      originPath: "public/space/w1/publish-destinations/d1/abc",
    })
    const ops = makeOps(async () => "https://scontent.fbcdn.net/p.jpg")

    const outcome = await publishDestinationAvatarService.refresh(
      input,
      ops,
      NOW,
    )

    expect(outcome).toBe("stored")
    expect(ops.fetchPictureUrl).toHaveBeenCalledWith({
      accessToken: TOKEN,
      externalId: "page-1",
      publisherKey: "facebook",
    })
    expect(
      String(mocks.uploadFileFromUrl.mock.calls[0]?.[1]).startsWith(
        "public/space/w1/publish-destinations/d1/",
      ),
    ).toBe(true)
    expect(mocks.recordAvatarFetch).toHaveBeenCalledWith({
      avatar: "public/space/w1/publish-destinations/d1/abc",
      fetchedAt: NOW,
      id: DESTINATION,
      workspaceId: WORKSPACE,
    })
  })

  test("a failure back-dates avatarFetchedAt so the retry comes after a day", async () => {
    const ops = makeOps(() =>
      Promise.reject(new Error(`Graph rejected token ${TOKEN}`)),
    )

    const outcome = await publishDestinationAvatarService.refresh(
      input,
      ops,
      NOW,
    )

    expect(outcome).toBe("failed")
    const written = mocks.recordAvatarFetch.mock.calls[0]?.[0] as {
      avatar: string | null
      fetchedAt: Date
    }
    expect(written.avatar).toBeNull()
    expect(NOW.getTime() - written.fetchedAt.getTime()).toBe(
      AVATAR_REFRESH_AFTER_MS - AVATAR_RETRY_AFTER_MS,
    )
    // Stale again exactly one retry window after the failure.
    const later = new Date(NOW.getTime() + AVATAR_RETRY_AFTER_MS + 1000)
    expect(isAvatarStale(written.fetchedAt, later)).toBe(true)
    expect(isAvatarStale(written.fetchedAt, NOW)).toBe(false)
  })

  test("never logs the token", async () => {
    const ops = makeOps(() =>
      Promise.reject(new Error(`Graph rejected token ${TOKEN}`)),
    )

    await publishDestinationAvatarService.refresh(input, ops, NOW)

    expect(mocks.logWarn).toHaveBeenCalled()
    expect(JSON.stringify(mocks.logWarn.mock.calls)).not.toContain(TOKEN)
  })

  test("a storage failure is a failed fetch, not an error", async () => {
    mocks.uploadFileFromUrl.mockRejectedValue(new Error("storage down"))
    const ops = makeOps(async () => "https://scontent.fbcdn.net/p.jpg")

    await expect(
      publishDestinationAvatarService.refresh(input, ops, NOW),
    ).resolves.toBe("failed")
    expect(mocks.recordAvatarFetch).toHaveBeenCalledTimes(1)
  })

  test("a destination with no picture records the attempt and keeps the old avatar", async () => {
    const ops = makeOps(async () => null)

    const outcome = await publishDestinationAvatarService.refresh(
      input,
      ops,
      NOW,
    )

    expect(outcome).toBe("noPicture")
    expect(mocks.uploadFileFromUrl).not.toHaveBeenCalled()
    expect(mocks.recordAvatarFetch).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: null, fetchedAt: NOW }),
    )
  })

  test("a blocked credential records a failed attempt without calling the network", async () => {
    mocks.loadPublishCredentials.mockResolvedValue({
      blocker: { code: "inboxNeedsReconnect" },
      ok: false,
    })
    const ops = makeOps(async () => "x")

    const outcome = await publishDestinationAvatarService.refresh(
      input,
      ops,
      NOW,
    )

    expect(outcome).toBe("failed")
    expect(ops.fetchPictureUrl).not.toHaveBeenCalled()
  })

  test("a TikTok destination is skipped", async () => {
    mocks.loadPublishCredentials.mockResolvedValue({
      credentials: {
        accessToken: TOKEN,
        destinationExternalId: "t",
        fence: { kind: "socialAccount" },
        publisherKey: "tiktok",
      },
      ok: true,
    })
    const ops = makeOps(async () => "x")

    await expect(
      publishDestinationAvatarService.refresh(input, ops, NOW),
    ).resolves.toBe("skipped")
    expect(mocks.recordAvatarFetch).not.toHaveBeenCalled()
  })

  test("only Meta CDN https URLs are downloaded", async () => {
    mocks.uploadFileFromUrl.mockImplementation(
      async (url: string, _p: string, _a: string, _m: number, validate) => {
        await validate(url)
        return { originPath: "p" }
      },
    )
    const ops = makeOps(async () => "https://evil.example.com/p.jpg")

    await expect(
      publishDestinationAvatarService.refresh(input, ops, NOW),
    ).resolves.toBe("failed")
  })
})

describe("publishDestinationAvatarService.enqueueRefresh", () => {
  beforeEach(() => vi.clearAllMocks())

  test("dedups ids, bounds the batch and uses a colon-free fixed job id", async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `d${index % 30}`)

    const enqueued = await publishDestinationAvatarService.enqueueRefresh({
      publishDestinationIds: ids,
      workspaceId: WORKSPACE,
    })

    expect(enqueued).toBe(AVATAR_ENQUEUE_MAX_PER_CALL)
    expect(mocks.lowAdd).toHaveBeenCalledTimes(AVATAR_ENQUEUE_MAX_PER_CALL)
    const options = mocks.lowAdd.mock.calls.map(
      (call) => (call as unknown[])[2] as { jobId: string },
    )
    for (const option of options) {
      expect(option.jobId).not.toContain(":")
    }
    expect(options[0]?.jobId).toBe(avatarJobId("d0"))
    expect(new Set(options.map((option) => option.jobId)).size).toBe(
      AVATAR_ENQUEUE_MAX_PER_CALL,
    )
  })

  test("carries ids only and never fails the caller when Redis is down", async () => {
    mocks.lowAdd.mockRejectedValueOnce(new Error("redis down"))

    const enqueued = await publishDestinationAvatarService.enqueueRefresh({
      delayMs: 10_000,
      publishDestinationIds: ["d1", "d2"],
      workspaceId: WORKSPACE,
    })

    expect(enqueued).toBe(1)
    const payload = mocks.lowAdd.mock.calls[1]?.[1]
    expect(payload).toEqual({
      data: { publishDestinationId: "d2", workspaceId: WORKSPACE },
      type: "refreshPublishDestinationAvatar",
    })
    expect(mocks.lowAdd.mock.calls[1]?.[2]).toMatchObject({ delay: 10_000 })
  })
})

describe("isAvatarStale", () => {
  test("never fetched or older than a week is stale", () => {
    expect(isAvatarStale(null, NOW)).toBe(true)
    expect(
      isAvatarStale(new Date(NOW.getTime() - AVATAR_REFRESH_AFTER_MS - 1), NOW),
    ).toBe(true)
    expect(isAvatarStale(new Date(NOW.getTime() - 1000), NOW)).toBe(false)
  })
})

describe("publishDestinationAvatarService.resolveForView", () => {
  const stateRow = (overrides: Record<string, unknown> = {}) => ({
    avatar: null,
    avatarFetchedAt: null,
    inboxId: "i1",
    state: "ready",
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findState.mockResolvedValue(stateRow())
    mocks.loadPublishCredentials.mockResolvedValue(inboxCredentials())
  })

  test("is null for a destination outside the workspace", async () => {
    mocks.findState.mockResolvedValue(null)
    const ops = makeOps(async () => "x")

    await expect(
      publishDestinationAvatarService.resolveForView(input, ops, NOW),
    ).resolves.toBeNull()
    expect(ops.fetchPictureUrl).not.toHaveBeenCalled()
  })

  test("serves a stored copy without the network", async () => {
    mocks.findState.mockResolvedValue(stateRow({ avatar: "public/a" }))
    const ops = makeOps(async () => "x")

    await expect(
      publishDestinationAvatarService.resolveForView(input, ops, NOW),
    ).resolves.toEqual({ kind: "stored", path: "public/a" })
    expect(ops.fetchPictureUrl).not.toHaveBeenCalled()
  })

  test("resolves a fresh URL and enqueues the mirror job once", async () => {
    const ops = makeOps(async () => "https://scontent.fbcdn.net/p.jpg")

    await expect(
      publishDestinationAvatarService.resolveForView(input, ops, NOW),
    ).resolves.toEqual({
      kind: "fresh",
      url: "https://scontent.fbcdn.net/p.jpg",
    })
    expect(mocks.lowAdd).toHaveBeenCalledTimes(1)
    expect(mocks.lowAdd.mock.calls[0]?.[2]).toMatchObject({
      jobId: avatarJobId(DESTINATION),
    })
  })

  test("a recorded no-picture or recent failure does not hit the network", async () => {
    mocks.findState.mockResolvedValue(stateRow({ avatarFetchedAt: NOW }))
    const ops = makeOps(async () => "x")

    await expect(
      publishDestinationAvatarService.resolveForView(input, ops, NOW),
    ).resolves.toEqual({ kind: "placeholder" })
    expect(ops.fetchPictureUrl).not.toHaveBeenCalled()
  })

  test("a page with no picture records the sentinel and serves the placeholder", async () => {
    const ops = makeOps(async () => null)

    await expect(
      publishDestinationAvatarService.resolveForView(input, ops, NOW),
    ).resolves.toEqual({ kind: "placeholder" })
    expect(mocks.recordAvatarFetch).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: null, fetchedAt: NOW }),
    )
    expect(mocks.lowAdd).not.toHaveBeenCalled()
  })

  test("a network error serves the placeholder and enqueues once, without the token in logs", async () => {
    const ops = makeOps(() => Promise.reject(new Error(`bad ${TOKEN}`)))

    await expect(
      publishDestinationAvatarService.resolveForView(input, ops, NOW),
    ).resolves.toEqual({ kind: "placeholder" })
    expect(mocks.lowAdd).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(mocks.logWarn.mock.calls)).not.toContain(TOKEN)
  })

  test("a non-Meta picture URL is never redirected to", async () => {
    const ops = makeOps(async () => "https://evil.example.com/p.jpg")

    await expect(
      publishDestinationAvatarService.resolveForView(input, ops, NOW),
    ).resolves.toEqual({ kind: "placeholder" })
  })

  test("a blocked credential records a failure and serves the placeholder", async () => {
    mocks.loadPublishCredentials.mockResolvedValue({
      blocker: { code: "inboxNeedsReconnect" },
      ok: false,
    })
    const ops = makeOps(async () => "x")

    await expect(
      publishDestinationAvatarService.resolveForView(input, ops, NOW),
    ).resolves.toEqual({ kind: "placeholder" })
    expect(ops.fetchPictureUrl).not.toHaveBeenCalled()
    expect(mocks.recordAvatarFetch).toHaveBeenCalledTimes(1)
  })
})
