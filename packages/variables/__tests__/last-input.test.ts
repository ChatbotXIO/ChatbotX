import { contentTypes } from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindLatestByContact,
  mockFindLatestIncomingMessageWithAttachments,
  mockResolveTenantSettings,
} = vi.hoisted(() => ({
  mockFindLatestByContact: vi.fn(),
  mockFindLatestIncomingMessageWithAttachments: vi.fn(),
  mockResolveTenantSettings: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findLatestByContact: mockFindLatestByContact,
  },
  messageService: {
    findLatestIncomingMessageWithAttachments:
      mockFindLatestIncomingMessageWithAttachments,
  },
  resolveTenantSettings: mockResolveTenantSettings,
}))

const ABSOLUTE_URL_RE = /^https?:\/\//i

vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, baseUrl: string) =>
    new URL(path, baseUrl).toString(),
  toPublicStorageUrl: (path: string, baseUrl: string) =>
    ABSOLUTE_URL_RE.test(path) ? path : new URL(path, baseUrl).toString(),
}))

const { getContactLastInput, getContactLastInputType } = await import(
  "../src/helpers/last-input"
)

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
