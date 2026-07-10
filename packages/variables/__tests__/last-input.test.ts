import { contentTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindConversationBy,
  mockFindLatestLastIncomingMessageAt,
  mockFindLatestIncomingMessageWithAttachments,
  mockResolveTenantSettings,
} = vi.hoisted(() => ({
  mockFindConversationBy: vi.fn(),
  mockFindLatestLastIncomingMessageAt: vi.fn(),
  mockFindLatestIncomingMessageWithAttachments: vi.fn(),
  mockResolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findBy: mockFindConversationBy,
  },
  contactInboxService: {
    findLatestLastIncomingMessageAtByContactId:
      mockFindLatestLastIncomingMessageAt,
  },
  messageService: {
    findLatestIncomingMessageWithAttachments:
      mockFindLatestIncomingMessageWithAttachments,
  },
  resolveTenantSettings: mockResolveTenantSettings,
}))

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
}))

const { getContactLastInput, getContactLastInputType } = await import(
  "../src/helpers/last-input"
)

describe("last input helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindConversationBy.mockResolvedValue({
      id: "conversation-1",
      workspaceId: "workspace-1",
    })
    // A recent lastAt keeps getSafeSinceTime bounded but non-null so the
    // message lookup runs.
    mockFindLatestLastIncomingMessageAt.mockResolvedValue(new Date())
    mockResolveTenantSettings.mockResolvedValue({
      storageUrl: "https://cdn.example/storage/",
    })
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

  test("last_input and last_input_type return null when no message exists", async () => {
    mockFindLatestIncomingMessageWithAttachments.mockResolvedValue(null)

    await expect(getContactLastInput("contact-1")).resolves.toBeNull()
    await expect(getContactLastInputType("contact-1")).resolves.toBeNull()
  })

  test("last_input returns null when the contact has no incoming activity", async () => {
    mockFindLatestLastIncomingMessageAt.mockResolvedValue(null)

    await expect(getContactLastInput("contact-1")).resolves.toBeNull()
    expect(mockFindLatestIncomingMessageWithAttachments).not.toHaveBeenCalled()
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
