import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByExternalId: vi.fn(),
  getPublicFileUrl: vi.fn((path: string) => `https://files.example/${path}`),
  insertBare: vi.fn(),
  isDatabaseError: vi.fn(() => false),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  markMetadataAttempt: vi.fn(),
  listFilterOptions: vi.fn(),
  resolveTenantSettings: vi.fn(),
  saveMetadata: vi.fn(),
  uploadFileFromUrl: vi.fn(),
  updateIntegrationIfChanged: vi.fn(),
  claimMetadataRetry: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  isDatabaseError: mocks.isDatabaseError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostRepository: {
    claimMetadataRetry: mocks.claimMetadataRetry,
    findByExternalId: mocks.findByExternalId,
    insertBare: mocks.insertBare,
    listFilterOptions: mocks.listFilterOptions,
    markMetadataAttempt: mocks.markMetadataAttempt,
    saveMetadata: mocks.saveMetadata,
    updateIntegrationIfChanged: mocks.updateIntegrationIfChanged,
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploadFileFromUrl: mocks.uploadFileFromUrl,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("../src/logger", () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("../src/utils", () => ({
  getPublicFileUrl: mocks.getPublicFileUrl,
}))

const { channelPostService } = await import("../src/channel-post/service")

const input = {
  externalPostId: "1780",
  fetchDetails: vi.fn(),
  inboxId: "inbox-1",
  integrationId: "integration-1",
  integrationType: "instagram" as const,
  sourceAccountId: "account-1",
  workspaceId: "workspace-1",
}

describe("channelPostService.resolveForComment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByExternalId.mockResolvedValue(null)
    mocks.insertBare.mockResolvedValue("post-1")
    mocks.updateIntegrationIfChanged.mockResolvedValue(false)
    mocks.claimMetadataRetry.mockResolvedValue(false)
    mocks.markMetadataAttempt.mockResolvedValue(undefined)
    mocks.listFilterOptions.mockResolvedValue([])
    mocks.saveMetadata.mockResolvedValue(undefined)
    mocks.uploadFileFromUrl.mockResolvedValue({ originPath: "thumbnail.png" })
  })

  test("records the bare post even when metadata hydration fails", async () => {
    input.fetchDetails.mockRejectedValueOnce(new Error("Graph unavailable"))

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    expect(mocks.insertBare).toHaveBeenCalledWith(input)
    expect(mocks.markMetadataAttempt).toHaveBeenCalledWith({
      id: "post-1",
      workspaceId: "workspace-1",
    })
    expect(mocks.loggerWarn).toHaveBeenCalledOnce()
  })

  test("keeps text metadata when the thumbnail re-host fails", async () => {
    input.fetchDetails.mockResolvedValue({
      caption: "A post",
      mediaType: "IMAGE",
      permalink: "https://instagram.com/p/1",
      publishedAt: new Date("2026-09-30T00:00:00.000Z"),
      thumbnailUrl: "https://cdn.example/photo.jpg",
    })
    mocks.uploadFileFromUrl.mockRejectedValueOnce(new Error("too large"))

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    // A failed/oversized thumbnail must not discard the text metadata, and the
    // post must not be marked for retry (metadataFetchedAt gets set on save).
    expect(mocks.saveMetadata).toHaveBeenCalledWith({
      id: "post-1",
      metadata: {
        caption: "A post",
        mediaType: "IMAGE",
        permalink: "https://instagram.com/p/1",
        publishedAt: new Date("2026-09-30T00:00:00.000Z"),
        thumbnail: null,
      },
      workspaceId: "workspace-1",
    })
    expect(mocks.markMetadataAttempt).not.toHaveBeenCalled()
  })

  test("does not record a post after its workspace FK was removed", async () => {
    const foreignKeyError = { cause: { code: "23503" } }
    mocks.insertBare.mockRejectedValueOnce(foreignKeyError)
    mocks.isDatabaseError.mockImplementation(
      (error) => error === foreignKeyError,
    )

    await expect(
      channelPostService.resolveForComment(input),
    ).resolves.toBeNull()

    expect(mocks.loggerInfo).toHaveBeenCalledOnce()
  })

  test("uses the conflict winner without fetching metadata a second time", async () => {
    mocks.insertBare.mockResolvedValue(null)
    mocks.findByExternalId.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "post-1",
      integrationId: "integration-1",
      integrationType: "instagram",
      metadataFetchedAt: new Date("2026-09-30T00:00:00.000Z"),
    })

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    expect(mocks.insertBare).toHaveBeenCalledOnce()
    expect(mocks.claimMetadataRetry).not.toHaveBeenCalled()
    expect(input.fetchDetails).not.toHaveBeenCalled()
  })

  test("keeps a hydrated same-integration post on the read-only fast path", async () => {
    mocks.findByExternalId.mockResolvedValue({
      id: "post-1",
      integrationId: "integration-1",
      integrationType: "instagram",
      metadataFetchedAt: new Date("2026-09-30T00:00:00.000Z"),
    })

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    expect(mocks.updateIntegrationIfChanged).not.toHaveBeenCalled()
    expect(mocks.claimMetadataRetry).not.toHaveBeenCalled()
    expect(input.fetchDetails).not.toHaveBeenCalled()
  })

  test("claims a missing-metadata post after reconnecting its integration", async () => {
    mocks.findByExternalId.mockResolvedValue({
      id: "post-1",
      integrationId: "old-integration",
      integrationType: "instagramFacebook",
      metadataFetchedAt: null,
    })
    mocks.claimMetadataRetry.mockResolvedValue(true)
    input.fetchDetails.mockResolvedValueOnce({
      caption: "A post",
      publishedAt: null,
      thumbnailUrl: null,
    })

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    expect(mocks.updateIntegrationIfChanged).toHaveBeenCalledWith(input)
    expect(mocks.claimMetadataRetry).toHaveBeenCalledWith({
      id: "post-1",
      maxRetryAgeMs: 24 * 60 * 60 * 1000,
      retryIntervalMs: 10 * 60 * 1000,
      workspaceId: "workspace-1",
    })
    expect(mocks.saveMetadata).toHaveBeenCalledWith({
      id: "post-1",
      metadata: {
        caption: "A post",
        mediaType: null,
        permalink: null,
        publishedAt: null,
        thumbnail: null,
      },
      workspaceId: "workspace-1",
    })
  })

  test("keeps PostgreSQL's timestamp cursor value unchanged", async () => {
    mocks.listFilterOptions.mockResolvedValue([
      {
        caption: "A post",
        externalPostId: "1780",
        id: "post-1",
        inboxId: "inbox-1",
        inboxName: "Instagram",
        integrationType: "instagram",
        permalink: "https://instagram.com/p/post-1",
        publishedAt: new Date("2026-09-30T00:00:00.000Z"),
        sortAt: "2026-09-30 00:00:00.123456+00",
        thumbnail: null,
      },
      {
        caption: "Another post",
        externalPostId: "1781",
        id: "post-2",
        inboxId: "inbox-1",
        inboxName: "Instagram",
        integrationType: "instagram",
        permalink: null,
        publishedAt: null,
        sortAt: "2026-09-30 00:00:00.123455+00",
        thumbnail: null,
      },
    ])
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://files.example/",
    })

    await expect(
      channelPostService.listFilterOptions({
        limit: 1,
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual({
      items: [
        {
          caption: "A post",
          externalPostId: "1780",
          id: "post-1",
          inboxId: "inbox-1",
          inboxName: "Instagram",
          integrationType: "instagram",
          permalink: "https://instagram.com/p/post-1",
          publishedAt: new Date("2026-09-30T00:00:00.000Z"),
          thumbnailUrl: null,
        },
      ],
      nextCursor: {
        id: "post-1",
        sortAt: "2026-09-30 00:00:00.123456+00",
      },
    })
  })

  test("bounds a hanging metadata fetch and retains the bare post", async () => {
    vi.useFakeTimers()
    input.fetchDetails.mockImplementation(
      () => new Promise<never>(() => undefined),
    )

    const resolving = channelPostService.resolveForComment(input)
    await vi.advanceTimersByTimeAsync(15_000)

    await expect(resolving).resolves.toBe("post-1")
    expect(mocks.markMetadataAttempt).toHaveBeenCalledWith({
      id: "post-1",
      workspaceId: "workspace-1",
    })

    vi.useRealTimers()
  })
})
