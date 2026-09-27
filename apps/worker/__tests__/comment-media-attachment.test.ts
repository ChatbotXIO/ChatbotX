import { beforeEach, describe, expect, test, vi } from "vitest"

const mockUploadFileFromUrl = vi.fn()
const mockAssertPublicUrl = vi.fn()
const mockRunThreadsAction = vi.fn()

vi.mock("@chatbotx.io/filesystem", () => ({
  getStoragePrefix: (workspaceId: string) => `public/ws/${workspaceId}/2026`,
  uploadFileFromUrl: mockUploadFileFromUrl,
}))

vi.mock("@chatbotx.io/business", () => ({
  assertPublicUrl: mockAssertPublicUrl,
  buildContext: vi.fn(async () => ({ ctx: "threads" })),
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: { threads: { runAction: mockRunThreadsAction } },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const { downloadCommentMediaAttachment, fetchThreadsCommentAttachments } =
  await import("../src/integration/handlers/comment-media-attachment")

const GIF_URL = "https://media.giphy.test/abc/giphy.gif"
const INTEGRATION_ROW = {
  id: "integration-1",
  auth: { tokens: { accessToken: "threads-token" } },
} as never

const uploadedGif = {
  name: "giphy.gif",
  originPath: "public/ws/ws-1/2026/file-1",
  size: 3,
  mimeType: "image/gif",
  fileType: "image",
  width: 200,
  height: 150,
}

describe("downloadCommentMediaAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("re-hosts the media behind the SSRF guard and returns an attachment", async () => {
    mockUploadFileFromUrl.mockResolvedValue(uploadedGif)

    const attachment = await downloadCommentMediaAttachment({
      url: GIF_URL,
      workspaceId: "ws-1",
      commentId: "comment-1",
    })

    expect(attachment).toEqual(
      expect.objectContaining({
        fileType: "image",
        mimeType: "image/gif",
        originPath: "public/ws/ws-1/2026/file-1",
        width: 200,
        height: 150,
      }),
    )
    const [url, path, acl, maxBytes, validateUrl] =
      mockUploadFileFromUrl.mock.calls[0]
    expect(url).toBe(GIF_URL)
    expect(path.startsWith("public/ws/ws-1/2026/")).toBe(true)
    expect(acl).toBe("public-read")
    expect(maxBytes).toBeGreaterThan(0)
    await validateUrl(GIF_URL)
    expect(mockAssertPublicUrl).toHaveBeenCalledWith(
      GIF_URL,
      "Comment media URL",
    )
  })

  test("returns undefined instead of throwing when the download fails", async () => {
    mockUploadFileFromUrl.mockRejectedValue(new Error("404"))

    await expect(
      downloadCommentMediaAttachment({
        url: GIF_URL,
        workspaceId: "ws-1",
        commentId: "comment-1",
      }),
    ).resolves.toBeUndefined()
  })

  test("rejects a response that is not an image or video", async () => {
    mockUploadFileFromUrl.mockResolvedValue({
      ...uploadedGif,
      mimeType: "text/html",
      fileType: "file",
    })

    await expect(
      downloadCommentMediaAttachment({
        url: GIF_URL,
        workspaceId: "ws-1",
        commentId: "comment-1",
      }),
    ).resolves.toBeUndefined()
  })
})

describe("fetchThreadsCommentAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("downloads the reply's gif_url", async () => {
    mockRunThreadsAction.mockResolvedValue(GIF_URL)
    mockUploadFileFromUrl.mockResolvedValue(uploadedGif)

    const attachments = await fetchThreadsCommentAttachments({
      workspaceId: "ws-1",
      commentId: "reply-1",
      integrationRow: INTEGRATION_ROW,
    })

    expect(mockRunThreadsAction).toHaveBeenCalledWith("getReplyGifUrl", {
      ctx: { ctx: "threads" },
      input: { replyId: "reply-1" },
    })
    expect(attachments).toEqual([
      expect.objectContaining({ mimeType: "image/gif" }),
    ])
  })

  test("returns no attachment for a reply without a GIF", async () => {
    mockRunThreadsAction.mockResolvedValue(null)

    const attachments = await fetchThreadsCommentAttachments({
      workspaceId: "ws-1",
      commentId: "reply-1",
      integrationRow: INTEGRATION_ROW,
    })

    expect(attachments).toEqual([])
    expect(mockUploadFileFromUrl).not.toHaveBeenCalled()
  })

  test("returns no attachment when the gif_url lookup fails", async () => {
    mockRunThreadsAction.mockRejectedValue(new Error("graph down"))

    await expect(
      fetchThreadsCommentAttachments({
        workspaceId: "ws-1",
        commentId: "reply-1",
        integrationRow: INTEGRATION_ROW,
      }),
    ).resolves.toEqual([])
  })
})
