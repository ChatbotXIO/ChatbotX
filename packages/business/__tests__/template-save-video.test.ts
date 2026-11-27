// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findLive: vi.fn(),
  saveWithVersion: vi.fn(),
  createWithFirstVersion: vi.fn(),
  buildTemplateSnapshot: vi.fn(),
  enqueueFanOut: vi.fn(),
  findMediaFileByPath: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateRepository: {
    findLive: mocks.findLive,
    saveWithVersion: mocks.saveWithVersion,
    createWithFirstVersion: mocks.createWithFirstVersion,
  },
}))
vi.mock("../src/media-library-file/service", () => ({
  mediaLibraryFileService: { findByPath: mocks.findMediaFileByPath },
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock("../src/template/version-changes", () => ({
  describeVersionChanges: () => [],
}))
vi.mock("@chatbotx.io/flow-config", () => ({
  parseTemplateExport: (payload: unknown) => ({ ok: true, data: payload }),
}))
vi.mock("../src/template/adapters/registry", () => ({
  getTemplateAdapter: () => undefined,
}))
vi.mock("../src/template/snapshot.service", () => ({
  buildTemplateSnapshot: mocks.buildTemplateSnapshot,
}))

const { saveTemplate } = await import("../src/template/template-save")

const mockFetch = vi.fn<typeof fetch>()
const onVersionAdvanced = vi.fn()

const actor = { kind: "member", permissions: { flows: true } } as const
const baseInput = {
  workspaceId: "ws-1",
  tenantId: "1",
  createdBy: "user-1",
  name: "Shop",
  selection: { mode: "all" },
  defaultPermissions: {},
  createInstallFolder: false,
  defaultAutoUpdate: false,
  actor,
} as never

const input = (extra: object) =>
  ({ ...(baseInput as object), ...extra }) as never

const vimeoOEmbed = () =>
  new Response(JSON.stringify({ width: 480, height: 270 }), { status: 200 })

const writtenSet = () => mocks.saveWithVersion.mock.calls[0]?.[0].set
const createdValues = () =>
  mocks.createWithFirstVersion.mock.calls[0]?.[0].values

describe("saveTemplate video", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", mockFetch)
    mockFetch.mockReset()
    mockFetch.mockImplementation(() => Promise.resolve(vimeoOEmbed()))
    mocks.buildTemplateSnapshot.mockResolvedValue({
      payload: { formatVersion: 1 },
      categoryCounts: { flows: 1 },
    })
    mocks.createWithFirstVersion.mockResolvedValue({ id: "tpl-1", version: 1 })
    mocks.saveWithVersion.mockImplementation(({ set }) => ({
      id: "tpl-1",
      version: 1,
      ...set,
    }))
    mocks.findLive.mockResolvedValue({
      id: "tpl-1",
      version: 1,
      payload: { formatVersion: 1 },
      imageUrl: null,
      embeddedVideo: null,
      youtubeVideoId: null,
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("creating with a Vimeo link writes embeddedVideo with the oEmbed ratio and a null legacy id", async () => {
    await saveTemplate(
      input({ video: { source: "https://vimeo.com/76979871" } }),
      onVersionAdvanced,
    )

    expect(createdValues()).toMatchObject({
      embeddedVideo: {
        provider: "vimeo",
        videoId: "76979871",
        aspectRatio: 480 / 270,
      },
      youtubeVideoId: null,
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  test("a YouTube link writes both columns in sync and needs no network", async () => {
    await saveTemplate(
      input({ video: { source: "https://youtu.be/dQw4w9WgXcQ" } }),
      onVersionAdvanced,
    )

    expect(createdValues()).toMatchObject({
      embeddedVideo: { provider: "youtube", videoId: "dQw4w9WgXcQ" },
      youtubeVideoId: "dQw4w9WgXcQ",
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("a refused actor causes no outbound request", async () => {
    await expect(
      saveTemplate(
        input({
          actor: { kind: "member", permissions: {} },
          video: { source: "https://vimeo.com/76979871" },
        }),
        onVersionAdvanced,
      ),
    ).rejects.toMatchObject({ code: "templateManagePermissionDenied" })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("another workspace's (missing) template causes no outbound request and no write", async () => {
    mocks.findLive.mockResolvedValue(undefined)

    await expect(
      saveTemplate(
        input({
          existingTemplateId: "tpl-x",
          video: { source: "https://vimeo.com/76979871" },
        }),
        onVersionAdvanced,
      ),
    ).rejects.toThrow("Template not found")

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mocks.saveWithVersion).not.toHaveBeenCalled()
  })

  test("an unsupported source is a validation error and makes no request or write", async () => {
    await expect(
      saveTemplate(
        input({ video: { source: "https://evil.example/v/1" } }),
        onVersionAdvanced,
      ),
    ).rejects.toMatchObject({
      code: "validation",
      field: "video",
      message: expect.stringContaining("YouTube, Vimeo"),
    })
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mocks.createWithFirstVersion).not.toHaveBeenCalled()
  })

  test("the youtubeVideoId alias converts to a YouTube video", async () => {
    await saveTemplate(
      input({ existingTemplateId: "tpl-1", youtubeVideoId: "dQw4w9WgXcQ" }),
      onVersionAdvanced,
    )

    expect(writtenSet()).toMatchObject({
      embeddedVideo: { provider: "youtube", videoId: "dQw4w9WgXcQ" },
      youtubeVideoId: "dQw4w9WgXcQ",
    })
  })

  test("an invalid alias id is a validation error", async () => {
    await expect(
      saveTemplate(
        input({ existingTemplateId: "tpl-1", youtubeVideoId: "bad id" }),
        onVersionAdvanced,
      ),
    ).rejects.toMatchObject({ code: "validation", field: "youtubeVideoId" })
    expect(mocks.saveWithVersion).not.toHaveBeenCalled()
  })

  test("video wins over youtubeVideoId when both are sent", async () => {
    await saveTemplate(
      input({
        existingTemplateId: "tpl-1",
        video: { source: "https://vimeo.com/76979871" },
        youtubeVideoId: "dQw4w9WgXcQ",
      }),
      onVersionAdvanced,
    )

    expect(writtenSet()).toMatchObject({
      embeddedVideo: { provider: "vimeo" },
      youtubeVideoId: null,
    })
  })

  test("video: null wins over a youtubeVideoId and clears both columns", async () => {
    await saveTemplate(
      input({
        existingTemplateId: "tpl-1",
        video: null,
        youtubeVideoId: "dQw4w9WgXcQ",
      }),
      onVersionAdvanced,
    )

    expect(writtenSet()).toMatchObject({
      embeddedVideo: null,
      youtubeVideoId: null,
    })
  })

  test("a blank or whitespace source clears the video without a request", async () => {
    for (const source of ["", "   \n"]) {
      mocks.saveWithVersion.mockClear()
      await saveTemplate(
        input({ existingTemplateId: "tpl-1", video: { source } }),
        onVersionAdvanced,
      )
      expect(writtenSet()).toMatchObject({
        embeddedVideo: null,
        youtubeVideoId: null,
      })
    }
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("a blank alias id clears the video", async () => {
    await saveTemplate(
      input({ existingTemplateId: "tpl-1", youtubeVideoId: "" }),
      onVersionAdvanced,
    )
    expect(writtenSet()).toMatchObject({
      embeddedVideo: null,
      youtubeVideoId: null,
    })
  })

  test("neither field leaves both columns out of the write", async () => {
    await saveTemplate(
      input({ existingTemplateId: "tpl-1" }),
      onVersionAdvanced,
    )

    expect(writtenSet()).not.toHaveProperty("embeddedVideo")
    expect(writtenSet()).not.toHaveProperty("youtubeVideoId")
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("re-saving the stored video keeps its ratio without a request", async () => {
    mocks.findLive.mockResolvedValue({
      id: "tpl-1",
      version: 1,
      payload: { formatVersion: 1 },
      imageUrl: null,
      embeddedVideo: {
        provider: "vimeo",
        videoId: "76979871",
        aspectRatio: 0.5,
      },
      youtubeVideoId: null,
    })

    await saveTemplate(
      input({
        existingTemplateId: "tpl-1",
        video: { source: "https://vimeo.com/76979871" },
      }),
      onVersionAdvanced,
    )

    expect(writtenSet().embeddedVideo.aspectRatio).toBe(0.5)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("a legacy-only row is the current video when the same YouTube id is re-saved", async () => {
    mocks.findLive.mockResolvedValue({
      id: "tpl-1",
      version: 1,
      payload: { formatVersion: 1 },
      imageUrl: null,
      embeddedVideo: null,
      youtubeVideoId: "dQw4w9WgXcQ",
    })
    await saveTemplate(
      input({ existingTemplateId: "tpl-1", youtubeVideoId: "dQw4w9WgXcQ" }),
      onVersionAdvanced,
    )
    expect(writtenSet().youtubeVideoId).toBe("dQw4w9WgXcQ")
  })

  test("a Short's stored ratio survives re-saving it through the youtubeVideoId alias", async () => {
    mocks.findLive.mockResolvedValue({
      id: "tpl-1",
      version: 1,
      payload: { formatVersion: 1 },
      imageUrl: null,
      embeddedVideo: {
        provider: "youtube",
        videoId: "dQw4w9WgXcQ",
        aspectRatio: 9 / 16,
      },
      youtubeVideoId: "dQw4w9WgXcQ",
    })

    await saveTemplate(
      input({ existingTemplateId: "tpl-1", youtubeVideoId: "dQw4w9WgXcQ" }),
      onVersionAdvanced,
    )

    expect(writtenSet().embeddedVideo.aspectRatio).toBe(9 / 16)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test("changing the video leaves the payload hash alone and never writes version columns", async () => {
    await saveTemplate(
      input({
        existingTemplateId: "tpl-1",
        video: { source: "https://vimeo.com/76979871" },
      }),
      onVersionAdvanced,
    )
    await saveTemplate(
      input({ existingTemplateId: "tpl-1", video: null }),
      onVersionAdvanced,
    )

    const [first, second] = mocks.saveWithVersion.mock.calls.map(
      ([call]) => call,
    )
    expect(first.snapshot.payloadHash).toBeTruthy()
    expect(first.snapshot.payloadHash).toBe(second.snapshot.payloadHash)
    for (const call of [first, second]) {
      expect(call.set).not.toHaveProperty("payloadHash")
      expect(call.set).not.toHaveProperty("version")
    }
    expect(onVersionAdvanced).not.toHaveBeenCalled()
  })
})
