import { beforeEach, describe, expect, test, vi } from "vitest"

const uploadAttachment = vi.fn()
const findByPageId = vi.fn()

vi.mock("@chatbotx.io/integration-messenger/apis/attachment", () => ({
  uploadAttachment,
}))
vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: { findByPageId },
}))

const { resolveContentAttachments } = await import(
  "@/features/facebook-marketing-messages/lib/media-attachment"
)

// Hoisted: Biome's useTopLevelRegex forbids a regex literal inside a function.
const MESSENGER_INTEGRATION_ERROR = /Messenger integration/
const ATTACHMENT_ERROR = /attachment/i

const integration = {
  auth: {
    tokens: { accessToken: "PAGE_TOKEN" },
    metadata: { version: "v25.0" },
  },
}

const mediaContent = (overrides: Record<string, unknown> = {}) => ({
  templateType: "media" as const,
  mediaType: "image" as const,
  media: {
    id: "m1",
    mode: "file" as const,
    url: "https://cdn.example.com/a.jpg",
  },
  buttons: [],
  quickReplies: [],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  findByPageId.mockResolvedValue(integration)
  uploadAttachment.mockResolvedValue({
    recipient_id: "0",
    attachment_id: "att_1",
  })
})

describe("resolveContentAttachments", () => {
  test("uploads the media and stamps the attachment id", async () => {
    const result = await resolveContentAttachments({
      workspaceId: "w1",
      pageId: "p1",
      content: mediaContent(),
    })

    expect(uploadAttachment).toHaveBeenCalledWith(
      integration.auth,
      "https://cdn.example.com/a.jpg",
      "image",
    )
    expect(result.templateType).toBe("media")
    if (result.templateType === "media") {
      expect(result.media.attachmentId).toBe("att_1")
    }
  })

  test("passes video as the file type for a video template", async () => {
    await resolveContentAttachments({
      workspaceId: "w1",
      pageId: "p1",
      content: mediaContent({ mediaType: "video" }),
    })

    expect(uploadAttachment).toHaveBeenCalledWith(
      integration.auth,
      expect.any(String),
      "video",
    )
  })

  test("skips the upload for non-media templates", async () => {
    const content = {
      templateType: "text" as const,
      text: "Hi",
      quickReplies: [],
    }

    const result = await resolveContentAttachments({
      workspaceId: "w1",
      pageId: "p1",
      content,
    })

    expect(uploadAttachment).not.toHaveBeenCalled()
    expect(result).toEqual(content)
  })

  test("reuses the previous attachment id when the url is unchanged", async () => {
    const result = await resolveContentAttachments({
      workspaceId: "w1",
      pageId: "p1",
      content: mediaContent(),
      previous: mediaContent({
        media: {
          id: "m1",
          mode: "file",
          url: "https://cdn.example.com/a.jpg",
          attachmentId: "att_old",
        },
      }),
    })

    expect(uploadAttachment).not.toHaveBeenCalled()
    if (result.templateType === "media") {
      expect(result.media.attachmentId).toBe("att_old")
    }
  })

  test("re-uploads when the url changed", async () => {
    await resolveContentAttachments({
      workspaceId: "w1",
      pageId: "p1",
      content: mediaContent({
        media: {
          id: "m1",
          mode: "file",
          url: "https://cdn.example.com/NEW.jpg",
        },
      }),
      previous: mediaContent({
        media: {
          id: "m1",
          mode: "file",
          url: "https://cdn.example.com/a.jpg",
          attachmentId: "att_old",
        },
      }),
    })

    expect(uploadAttachment).toHaveBeenCalledTimes(1)
  })

  test("throws when the page has no Messenger integration", async () => {
    findByPageId.mockResolvedValue(undefined)

    await expect(
      resolveContentAttachments({
        workspaceId: "w1",
        pageId: "p1",
        content: mediaContent(),
      }),
    ).rejects.toThrow(MESSENGER_INTEGRATION_ERROR)
  })

  test("throws when Meta returns no attachment id", async () => {
    uploadAttachment.mockResolvedValue({ recipient_id: "0" })

    await expect(
      resolveContentAttachments({
        workspaceId: "w1",
        pageId: "p1",
        content: mediaContent(),
      }),
    ).rejects.toThrow(ATTACHMENT_ERROR)
  })
})
