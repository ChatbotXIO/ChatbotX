// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findWorkspaceByTokenHash,
  isWorkspaceScheduledForDeletion,
  getAccessState,
  isAtLimit,
  assertApiNotRateLimited,
  createOrUpdate,
  getDetailOrFail,
  listPage,
  previewWithCollisions,
} = vi.hoisted(() => ({
  findWorkspaceByTokenHash: vi.fn(),
  isWorkspaceScheduledForDeletion: vi.fn().mockReturnValue(false),
  getAccessState: vi.fn().mockResolvedValue({ blocked: false }),
  isAtLimit: vi.fn().mockResolvedValue(false),
  assertApiNotRateLimited: vi.fn().mockResolvedValue(undefined),
  createOrUpdate: vi.fn(),
  getDetailOrFail: vi.fn(),
  listPage: vi.fn(),
  previewWithCollisions: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const video = await import(
    "../../../packages/business/src/template/template-video"
  )
  return {
    toTemplateVideoProjection: video.toTemplateVideoProjection,
    workspaceApiTokenService: { findWorkspaceByTokenHash },
    isWorkspaceScheduledForDeletion,
    userQuotaService: { getAccessState },
    quotaEnforcementService: { isAtLimit },
    templateService: { createOrUpdate, getDetailOrFail, listPage },
    templateInstallationRequestService: { previewWithCollisions },
    resolveTemplateShareUrl: vi.fn(),
  }
})

vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({ assertApiNotRateLimited }))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: () => "203.0.113.9",
}))
vi.mock("@/env", () => ({ isCloud: () => true }))
vi.mock("@/middlewares/auth", () => ({ authMiddleware: vi.fn() }))

const { call } = await import("@orpc/server")
const { templatesPublicRouter, templatePreviewsPublicRouter } = await import(
  "../src/features/templates/api/public"
)
const { fromYoutubeVideoId } = await import("@chatbotx.io/utils/embedded-video")

const context = {
  context: { headers: new Headers({ Authorization: "Bearer cbx_ws_fixture" }) },
}

const baseRow = {
  id: "101",
  name: "Welcome",
  description: null,
  imageUrl: null,
  publisherName: null,
  youtubeVideoId: null,
  embeddedVideo: null,
  testLink: null,
  selection: {},
  defaultPermissions: { allowEdit: true, allowDelete: true },
  createInstallFolder: false,
  defaultAutoUpdate: false,
  shareEnabled: false,
  shareExpiresAt: null,
  categoryCounts: {},
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
}

const createInput = {
  name: "Welcome",
  selection: {},
  defaultPermissions: { allowEdit: true, allowDelete: true },
  createInstallFolder: false,
  defaultAutoUpdate: false,
}

const vimeoRow = {
  ...baseRow,
  embeddedVideo: {
    provider: "vimeo",
    videoId: "76979871",
    privacyHash: "ad0e59b079",
    aspectRatio: 1.7777,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  isWorkspaceScheduledForDeletion.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  isAtLimit.mockResolvedValue(false)
  assertApiNotRateLimited.mockResolvedValue(undefined)
  findWorkspaceByTokenHash.mockResolvedValue({
    workspace: { id: "ws-1", ownerId: "owner-1", tenantId: "tenant-1" },
    apiToken: { id: "token-1", permission: "full", scopes: null },
  })
  createOrUpdate.mockResolvedValue({ id: "101" })
  getDetailOrFail.mockResolvedValue(baseRow)
})

const savedWith = async (input: Record<string, unknown>) => {
  await call(
    templatesPublicRouter.create,
    { ...createInput, ...input },
    context,
  )
  return createOrUpdate.mock.calls[0]?.[0] as Record<string, unknown>
}

describe("templates.create video input", () => {
  test("an omitted video and alias reach the service as absent (leave unchanged)", async () => {
    const arg = await savedWith({})
    expect("video" in arg).toBe(false)
    expect("youtubeVideoId" in arg).toBe(false)
  })

  test("null stays null (clear), distinct from omitted", async () => {
    const arg = await savedWith({ video: null })
    expect(arg.video).toBeNull()
  })

  test.each([
    "",
    "   \n",
  ])("a blank source %j becomes null (clear), never a parse error", async (source) => {
    const arg = await savedWith({ video: { source } })
    expect(arg.video).toBeNull()
  })

  test("a source is forwarded verbatim for the service to parse", async () => {
    const source = "https://vimeo.com/76979871"
    const arg = await savedWith({ video: { source } })
    expect(arg.video).toEqual({ source })
  })

  test("a GET video object echoed back as input is accepted (extra keys stripped)", async () => {
    getDetailOrFail.mockResolvedValue(vimeoRow)
    const got = await call(templatesPublicRouter.get, { id: "101" }, context)
    const arg = await savedWith({ video: got.video })
    expect(arg.video).toEqual({ source: got.video?.source })
  })

  test("a GET → PUT echo of a non-9:16 portrait YouTube row forwards a watch source", async () => {
    getDetailOrFail.mockResolvedValue({
      ...baseRow,
      youtubeVideoId: "2CkofPRY3V4",
      embeddedVideo: {
        provider: "youtube",
        videoId: "2CkofPRY3V4",
        aspectRatio: 0.75,
      },
    })
    const got = await call(templatesPublicRouter.get, { id: "101" }, context)
    expect(got.video?.source).toBe(
      "https://www.youtube.com/watch?v=2CkofPRY3V4",
    )
    const arg = await savedWith({ video: got.video })
    expect(arg.video).toEqual({
      source: "https://www.youtube.com/watch?v=2CkofPRY3V4",
    })
  })

  test("the deprecated alias is forwarded; video is forwarded alongside it (the service gives video precedence)", async () => {
    const alias = await savedWith({ youtubeVideoId: "dQw4w9WgXcQ" })
    expect(alias.youtubeVideoId).toBe("dQw4w9WgXcQ")
    expect("video" in alias).toBe(false)

    createOrUpdate.mockClear()
    const both = await savedWith({
      youtubeVideoId: "dQw4w9WgXcQ",
      video: null,
    })
    expect(both.video).toBeNull()
    expect(both.youtubeVideoId).toBe("dQw4w9WgXcQ")
  })

  test("a malformed alias id and an over-long source are rejected (422 invalidRequestData) before the service", async () => {
    await expect(
      call(
        templatesPublicRouter.create,
        { ...createInput, youtubeVideoId: "short" },
        context,
      ),
    ).rejects.toMatchObject({ code: "invalidRequestData", status: 422 })
    await expect(
      call(
        templatesPublicRouter.create,
        { ...createInput, video: { source: "x".repeat(4001) } },
        context,
      ),
    ).rejects.toMatchObject({ code: "invalidRequestData", status: 422 })
    expect(createOrUpdate).not.toHaveBeenCalled()
  })

  test("update forwards the same presence semantics", async () => {
    await call(
      templatesPublicRouter.update,
      { ...createInput, id: "101", video: { source: "" } },
      context,
    )
    expect(createOrUpdate.mock.calls[0]?.[0]).toMatchObject({
      existingTemplateId: "101",
      video: null,
    })
  })
})

describe("template video output", () => {
  test("get exposes the playable view and a derived youtubeVideoId", async () => {
    const youtube = fromYoutubeVideoId("dQw4w9WgXcQ")
    getDetailOrFail.mockResolvedValue({
      ...baseRow,
      embeddedVideo: youtube,
      youtubeVideoId: "dQw4w9WgXcQ",
    })
    const got = await call(templatesPublicRouter.get, { id: "101" }, context)
    expect(got.youtubeVideoId).toBe("dQw4w9WgXcQ")
    expect(got.video?.provider).toBe("youtube")
    expect(got.video?.playback).toMatchObject({
      kind: "iframe",
      src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    })
    expect(got.video?.playback).toHaveProperty("allow")
  })

  test("a non-YouTube video has a null youtubeVideoId", async () => {
    getDetailOrFail.mockResolvedValue(vimeoRow)
    const got = await call(templatesPublicRouter.get, { id: "101" }, context)
    expect(got.youtubeVideoId).toBeNull()
    expect(got.video?.provider).toBe("vimeo")
    expect(got.video?.playback.kind).toBe("iframe")
  })

  test("a legacy row with only youtubeVideoId still gets a video", async () => {
    getDetailOrFail.mockResolvedValue({
      ...baseRow,
      youtubeVideoId: "dQw4w9WgXcQ",
    })
    const got = await call(templatesPublicRouter.get, { id: "101" }, context)
    expect(got.video?.provider).toBe("youtube")
  })

  test("no video is null on both fields; a corrupt embeddedVideo does not throw", async () => {
    const none = await call(templatesPublicRouter.get, { id: "101" }, context)
    expect(none.video).toBeNull()
    expect(none.youtubeVideoId).toBeNull()

    getDetailOrFail.mockResolvedValue({
      ...baseRow,
      embeddedVideo: { provider: "vimeo", videoId: "<script>" },
    })
    const corrupt = await call(
      templatesPublicRouter.get,
      { id: "101" },
      context,
    )
    expect(corrupt.video).toBeNull()
  })

  test("list projects every row's video", async () => {
    listPage.mockResolvedValue({
      items: [
        { ...vimeoRow, installCount: 1 },
        { ...baseRow, id: "102", installCount: 0 },
      ],
      nextCursor: null,
    })
    const page = await call(templatesPublicRouter.list, {}, context)
    expect(page.items.map((item) => item.video?.provider ?? null)).toEqual([
      "vimeo",
      null,
    ])
  })

  test("create and update responses carry the saved video", async () => {
    getDetailOrFail.mockResolvedValue(vimeoRow)
    const created = await call(
      templatesPublicRouter.create,
      createInput,
      context,
    )
    expect(created.video?.provider).toBe("vimeo")
    const updated = await call(
      templatesPublicRouter.update,
      { ...createInput, id: "101" },
      context,
    )
    expect(updated.video?.provider).toBe("vimeo")
  })

  test("the preview forwards the projected video", async () => {
    const view = {
      provider: "vimeo" as const,
      source: "https://vimeo.com/76979871",
      aspectRatio: 1.7777,
      playback: {
        kind: "iframe" as const,
        src: "https://player.vimeo.com/video/76979871",
        allow: "autoplay; fullscreen; picture-in-picture",
      },
    }
    previewWithCollisions.mockResolvedValue({
      installable: true,
      template: {
        name: "Welcome",
        description: null,
        imageUrl: null,
        publisherName: null,
        video: view,
        youtubeVideoId: null,
        testLink: null,
        categoryCounts: {},
      },
      requiredInboxes: [],
      requiredChannels: [],
      collisions: [],
      collisionSummary: { create: 0, reuse: 0, rename: 0, bind: 0, unbound: 0 },
      existingInstallation: null,
      publisherUninstallDisclosure: {
        version: 1,
        publisherSees: [],
        publisherCan: [],
        uninstallDeletes: "",
      },
    })
    const result = await call(
      templatePreviewsPublicRouter.get,
      { id: "tok" },
      context,
    )
    expect(result).toMatchObject({
      installable: true,
      template: { video: view },
    })
  })
})
