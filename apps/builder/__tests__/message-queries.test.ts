import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
  listForConversation: vi.fn(),
  findByIdWithUrls: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messageService: {
    listForConversation: mocks.listForConversation,
    findByIdWithUrls: mocks.findByIdWithUrls,
  },
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

const { findMessage, listMessages } = await import(
  "../src/features/messages/queries"
)

describe("message queries adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listForConversation.mockResolvedValue({ data: [], nextCursor: null })
    mocks.findByIdWithUrls.mockResolvedValue({
      id: "msg-1",
      workspaceId: "ws-1",
      conversationId: "conv-1",
      attachments: [],
    })
  })

  test("findMessage asserts access before delegating to messageService", async () => {
    const createdAt = new Date("2026-06-01T00:00:00Z")

    await findMessage({ id: "msg-1", workspaceId: "ws-1", createdAt })

    expect(mocks.assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith("ws-1")
    expect(mocks.findByIdWithUrls).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "msg-1",
      createdAt,
    })
  })

  test("listMessages delegates the request as-is when no cursor is given", async () => {
    await listMessages({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      perPage: 20,
    })

    expect(mocks.listForConversation).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: undefined,
      cursor: undefined,
      limit: 20,
    })
  })

  test("listMessages returns null cursors when the service reports no next page", async () => {
    const result = await listMessages({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      perPage: 20,
    })

    expect(result.nextCursor).toBeNull()
    expect(result.prevCursor).toBeNull()
  })
})
