import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByIdForContact: vi.fn(),
  findMostRecentByContact: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    findByIdForContact: (...args: unknown[]) =>
      mocks.findByIdForContact(...args),
    findMostRecentByContact: (...args: unknown[]) =>
      mocks.findMostRecentByContact(...args),
  },
}))

const { resolveActionContactInbox } = await import(
  "../src/trigger/services/resolve-action-contact-inbox"
)

describe("resolveActionContactInbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("prefers the threaded contactInboxId when it validates (workspace + contact scoped)", async () => {
    // Arrange
    mocks.findByIdForContact.mockResolvedValue({
      id: "ci-whatsapp",
      channel: "whatsapp",
      inboxId: "inbox-whatsapp",
    })

    // Act
    const result = await resolveActionContactInbox({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInboxId: "ci-whatsapp",
    })

    // Assert
    expect(mocks.findByIdForContact).toHaveBeenCalledWith({
      id: "ci-whatsapp",
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
    expect(mocks.findMostRecentByContact).not.toHaveBeenCalled()
    expect(result).toEqual({
      id: "ci-whatsapp",
      channel: "whatsapp",
      inboxId: "inbox-whatsapp",
    })
  })

  test("falls back to most-recent-by-contact when no contactInboxId is threaded", async () => {
    // Arrange
    mocks.findMostRecentByContact.mockResolvedValue({
      id: "ci-recent",
      channel: "messenger",
      inboxId: "inbox-messenger",
    })

    // Act
    const result = await resolveActionContactInbox({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })

    // Assert
    expect(mocks.findByIdForContact).not.toHaveBeenCalled()
    expect(mocks.findMostRecentByContact).toHaveBeenCalledWith({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({
      id: "ci-recent",
      channel: "messenger",
      inboxId: "inbox-messenger",
    })
  })

  test("falls back to most-recent-by-contact when the threaded id is stale or belongs to another contact", async () => {
    // Arrange
    mocks.findByIdForContact.mockResolvedValue(null)
    mocks.findMostRecentByContact.mockResolvedValue({
      id: "ci-recent",
      channel: "whatsapp",
      inboxId: "inbox-whatsapp",
    })

    // Act
    const result = await resolveActionContactInbox({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInboxId: "ci-foreign-or-deleted",
    })

    // Assert
    expect(mocks.findByIdForContact).toHaveBeenCalledWith({
      id: "ci-foreign-or-deleted",
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
    expect(mocks.findMostRecentByContact).toHaveBeenCalledWith({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({
      id: "ci-recent",
      channel: "whatsapp",
      inboxId: "inbox-whatsapp",
    })
  })

  test("returns null when the contact has no inbox at all", async () => {
    // Arrange
    mocks.findMostRecentByContact.mockResolvedValue(null)

    // Act
    const result = await resolveActionContactInbox({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })

    // Assert
    expect(result).toBeNull()
  })
})
