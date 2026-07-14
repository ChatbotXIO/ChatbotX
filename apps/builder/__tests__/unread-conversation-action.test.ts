// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const repo = {
    findLastByConversation: vi.fn().mockResolvedValue([]),
  }
  return {
    createMessageRepository: vi.fn().mockResolvedValue(repo),
    findOrFail: vi.fn(),
    // Identity mock: getSafeSinceTime's output becomes exactly the anchor it
    // was given (minus the buffer subtraction, which callers don't assert on
    // here), so assertions can compare sinceTime's anchor input directly.
    getSafeSinceTime: vi.fn((value: Date | undefined) => value),
    repo,
    updateReadStatus: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: vi.fn(() => ({
      action: vi.fn(),
    })),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    updateReadStatus: mocks.updateReadStatus,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
  getSafeSinceTime: mocks.getSafeSinceTime,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  conversationModel: {},
}))

const { unreadConversation } = await import(
  "../src/features/conversations/actions/unread-conversation.action"
)

describe("unreadConversation sinceTime anchor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMessageRepository.mockResolvedValue(mocks.repo)
    mocks.repo.findLastByConversation.mockResolvedValue([])
    mocks.updateReadStatus.mockResolvedValue(undefined)
  })

  test("anchors sinceTime on the conversation's own lastActivityAt, not a shared contactInbox anchor", async () => {
    // Two conversations for the same contact could share one ContactInbox
    // (its lastMessageAt would reflect whichever was most recently active —
    // irrelevant here since the fix no longer reads it at all). This
    // conversation is the older, less-active one.
    const olderCommentConversation = {
      id: "conv-comment",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-12-01T00:00:00Z"),
    }
    mocks.findOrFail.mockResolvedValue(olderCommentConversation)

    await unreadConversation({ workspaceId: "ws-1", id: "conv-comment" })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith(
      "conv-comment",
      expect.objectContaining({
        sinceTime: olderCommentConversation.lastActivityAt,
      }),
    )
  })

  test("falls back to the conversation's createdAt when lastActivityAt is unset", async () => {
    const conversation = {
      id: "conv-new",
      workspaceId: "ws-1",
      contactId: "contact-2",
      lastActivityAt: null,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    }
    mocks.findOrFail.mockResolvedValue(conversation)

    await unreadConversation({ workspaceId: "ws-1", id: "conv-new" })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith(
      "conv-new",
      expect.objectContaining({
        sinceTime: conversation.createdAt,
      }),
    )
  })

  test("marks the second-to-last incoming message as the new read boundary", async () => {
    const conversation = {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      createdAt: new Date("2025-12-01T00:00:00Z"),
    }
    mocks.findOrFail.mockResolvedValue(conversation)
    mocks.repo.findLastByConversation.mockResolvedValue([
      { createdAt: new Date("2026-01-01T00:05:00Z") },
      { createdAt: new Date("2026-01-01T00:00:00Z") },
    ])

    const result = await unreadConversation({
      workspaceId: "ws-1",
      id: "conv-1",
    })

    expect(result.agentLastReadAt).toEqual(new Date("2026-01-01T00:00:00Z"))
    expect(mocks.updateReadStatus).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-1",
      agentLastReadAt: new Date("2026-01-01T00:00:00Z"),
    })
  })
})
