import { contentTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockEnsureAttachmentStored,
  mockFindLatestByContact,
  mockFindLatestIncomingMessageWithAttachments,
  mockResolveTenantSettings,
  mockFindContactInbox,
  mockResolveMediaUrl,
} = vi.hoisted(() => ({
  mockFindContactInbox: vi.fn(),
  mockResolveMediaUrl: vi.fn(),
  mockEnsureAttachmentStored: vi.fn(),
  mockFindLatestByContact: vi.fn(),
  mockFindLatestIncomingMessageWithAttachments: vi.fn(),
  mockResolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/channel-registry/media-hydration", () => ({
  ensureAttachmentStored: mockEnsureAttachmentStored,
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findLatestByContact: mockFindLatestByContact,
  },
  messageService: {
    findLatestIncomingMessageWithAttachments:
      mockFindLatestIncomingMessageWithAttachments,
  },
  contactInboxService: { findBy: mockFindContactInbox },
  resolveMediaUrl: mockResolveMediaUrl,
  resolveTenantSettings: mockResolveTenantSettings,
}))

const ABSOLUTE_URL_RE = /^https?:\/\//i

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
  toPublicStorageUrl: (path: string, baseUrl: string) =>
    ABSOLUTE_URL_RE.test(path) ? path : new URL(path, baseUrl).toString(),
}))

const {
  getContactLastInput,
  getContactLastInputType,
  getContactLastTextInput,
} = await import("../src/helpers/last-input")

describe("last input helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindLatestByContact.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
      lastActivityAt: new Date(),
      createdAt: new Date(),
    })
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "https://cdn.example/storage/",
    })
    // Pass-through: a stored key is returned as-is, like the real helper.
    mockEnsureAttachmentStored.mockImplementation(
      async (input: { originPath?: string }) =>
        input.originPath ? { originPath: input.originPath } : null,
    )
  })

  test("last_input returns latest text message text", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: "latest incoming text",
      attachments: [],
    })

    await expect(getContactLastInput("contact-1")).resolves.toBe(
      "latest incoming text",
    )
    expect(mockFindLatestIncomingMessageWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        workspaceId: "workspace-1",
      }),
    )
  })

  test("last_input returns a public URL for media messages", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: null,
      attachments: [
        {
          fileType: "image",
          originPath: "public/space/workspace-1/messages/image.png",
        },
      ],
    })

    await expect(getContactLastInput("contact-1")).resolves.toBe(
      "https://cdn.example/storage/public/space/workspace-1/messages/image.png",
    )
  })

  test("last_input stores a lazily-ingested attachment and returns the stored object's URL", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: null,
      attachments: [
        {
          id: "att-1",
          messageCreatedAt: new Date("2026-10-14T01:00:00.000Z"),
          fileType: "image",
          originPath: "https://scontent.example/photo.jpg?sig=abc",
        },
      ],
    })
    mockEnsureAttachmentStored.mockResolvedValue({
      originPath: "workspace/messenger/workspace-1/int-1/2026/10/14/abc.jpg",
    })

    await expect(getContactLastInput("contact-1")).resolves.toBe(
      "https://cdn.example/storage/workspace/messenger/workspace-1/int-1/2026/10/14/abc.jpg",
    )
    expect(mockEnsureAttachmentStored).toHaveBeenCalledWith({
      attachmentId: "att-1",
      workspaceId: "workspace-1",
      messageCreatedAt: new Date("2026-10-14T01:00:00.000Z"),
      originPath: "https://scontent.example/photo.jpg?sig=abc",
    })
  })

  test("last_input is null when the attachment is permanently unavailable", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: null,
      attachments: [
        {
          id: "att-1",
          messageCreatedAt: new Date(),
          fileType: "image",
          originPath: "failed:unresolvable",
        },
      ],
    })
    mockEnsureAttachmentStored.mockResolvedValue(null)

    await expect(getContactLastInput("contact-1")).resolves.toBeNull()
  })

  test("last_input falls back to the media proxy URL when the attachment is not stored in time", async () => {
    // The flow still gets a link that shows the media (the proxy serves the
    // provider's copy and finishes storing it) instead of an empty value.
    const messageCreatedAt = new Date()
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      contactInboxId: "ci-1",
      text: null,
      attachments: [
        {
          id: "att-1",
          messageCreatedAt,
          fileType: "image",
          originPath: "https://scontent.example/photo.jpg",
        },
      ],
    })
    mockEnsureAttachmentStored.mockRejectedValue(new Error("not ready"))
    mockFindContactInbox.mockResolvedValue({ id: "ci-1", channel: "messenger" })
    mockResolveMediaUrl.mockResolvedValue(
      "https://app.example/media/attachment/token",
    )

    await expect(getContactLastInput("contact-1")).resolves.toBe(
      "https://app.example/media/attachment/token",
    )
    expect(mockFindContactInbox).toHaveBeenCalledWith({
      where: { id: "ci-1" },
    })
    expect(mockResolveMediaUrl).toHaveBeenCalledWith(
      {
        kind: "attachment",
        attachmentId: "att-1",
        workspaceId: "workspace-1",
        originPath: "https://scontent.example/photo.jpg",
        channel: "messenger",
        messageCreatedAt,
      },
      expect.any(Function),
    )
  })

  test("last_input is null instead of throwing when neither the store nor the proxy fallback works", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      contactInboxId: "ci-1",
      text: null,
      attachments: [
        {
          id: "att-1",
          messageCreatedAt: new Date(),
          fileType: "image",
          originPath: "https://scontent.example/photo.jpg",
        },
      ],
    })
    mockEnsureAttachmentStored.mockRejectedValue(new Error("not ready"))
    mockFindContactInbox.mockRejectedValue(new Error("db down"))

    await expect(getContactLastInput("contact-1")).resolves.toBeNull()
  })

  test("last_input and last_input_type return null when no message exists", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue(null)

    await expect(getContactLastInput("contact-1")).resolves.toBeNull()
    await expect(getContactLastInputType("contact-1")).resolves.toBeNull()
  })

  test("last_input returns null when the contact has no conversation", async () => {
    mockFindLatestByContact.mockResolvedValue(undefined)

    await expect(getContactLastInput("contact-1")).resolves.toBeNull()
    expect(mockFindLatestIncomingMessageWithAttachments).not.toHaveBeenCalled()
  })

  test("last_input resolves the conversation the contact is most recently active in", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: "latest incoming text",
      attachments: [],
    })

    await getContactLastInput("contact-1")

    expect(mockFindLatestByContact).toHaveBeenCalledWith({
      contactId: "contact-1",
    })
  })

  test("last_input_type returns latest message content type", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: "latest incoming text",
      attachments: [],
    })

    await expect(getContactLastInputType("contact-1")).resolves.toBe(
      contentTypes.enum.text,
    )
  })

  test("last_input_type returns the attachment file type for media messages", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: null,
      attachments: [{ fileType: "image", originPath: "image.png" }],
    })

    await expect(getContactLastInputType("contact-1")).resolves.toBe("image")
  })
})

describe("last_text_input helper", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindLatestByContact.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
      lastActivityAt: new Date(),
      createdAt: new Date(),
    })
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "https://cdn.example/storage/",
    })
  })

  test("returns the text of the latest incoming text message", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: "typed by the contact",
      attachments: [],
    })

    await expect(getContactLastTextInput("contact-1")).resolves.toBe(
      "typed by the contact",
    )
  })

  test("never returns a media URL: an attachment message has no text input", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue({
      contentType: contentTypes.enum.text,
      text: null,
      attachments: [
        {
          fileType: "image",
          originPath: "public/space/workspace-1/messages/image.png",
        },
      ],
    })

    await expect(getContactLastTextInput("contact-1")).resolves.toBeNull()
  })

  test("returns null when there is no incoming message or no conversation", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue(null)
    await expect(getContactLastTextInput("contact-1")).resolves.toBeNull()

    mockFindLatestByContact.mockResolvedValue(null)
    await expect(getContactLastTextInput("contact-1")).resolves.toBeNull()
  })
})
