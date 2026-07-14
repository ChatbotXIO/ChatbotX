// @vitest-environment node

import { endOfHour } from "date-fns"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const repo = {
    findLastByConversation: vi.fn().mockResolvedValue([]),
  }
  return {
    assertCurrentUserCanAccessChatbot: vi.fn().mockResolvedValue(undefined),
    buildConversationWhere: vi.fn().mockReturnValue({}),
    createMessageRepository: vi.fn().mockResolvedValue(repo),
    findManyQuery: vi.fn().mockResolvedValue([]),
    findWithFullRelations: vi.fn().mockResolvedValue(null),
    getCurrentUserAndTargetWorkspace: vi.fn().mockResolvedValue(null),
    // Identity mock: resolveLastMessageSinceTime's output becomes exactly the
    // anchor it was given, so assertions can compare sinceTime straight
    // against each conversation's own lastActivityAt.
    getSafeSinceTime: vi.fn((value: Date | undefined) => value),
    notFoundException: (message: string) => new Error(message),
    repo,
  }
})

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findManyQuery: mocks.findManyQuery,
    findWithFullRelations: mocks.findWithFullRelations,
  },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: mocks.notFoundException,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createMessageRepository: mocks.createMessageRepository,
  getSafeSinceTime: mocks.getSafeSinceTime,
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
  getCurrentUserAndTargetWorkspace: mocks.getCurrentUserAndTargetWorkspace,
}))

vi.mock(
  "../src/features/conversations/queries/build-conversation-where",
  () => ({
    buildConversationWhere: mocks.buildConversationWhere,
  }),
)

const { listConversations, findConversation } = await import(
  "../src/features/conversations/queries/list-conversations.query"
)

describe("listConversations / findConversation last-message sinceTime", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMessageRepository.mockResolvedValue(mocks.repo)
    mocks.repo.findLastByConversation.mockResolvedValue([])
    mocks.getCurrentUserAndTargetWorkspace.mockResolvedValue(null)
    mocks.buildConversationWhere.mockReturnValue({})
  })

  test("anchors each conversation's sinceTime on its own lastActivityAt, not a shared contactInbox anchor", async () => {
    // Same contact, same shared ContactInbox (its lastMessageAt would reflect
    // whichever conversation was most recently active — irrelevant here since
    // the fix no longer reads it at all), but two conversations with
    // different lastActivityAt: an older comment thread and a newer DM.
    const sharedContactInbox = {
      id: "ci-1",
      contactId: "contact-1",
      lastMessageAt: new Date("2026-06-10T00:00:00Z"),
    }
    const olderCommentConversation = {
      id: "conv-comment",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [sharedContactInbox],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
    }
    const newerDmConversation = {
      id: "conv-dm",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-06-10T00:00:00Z"),
      contactInboxes: [sharedContactInbox],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
    }
    mocks.findManyQuery.mockResolvedValue([
      olderCommentConversation,
      newerDmConversation,
    ])

    await listConversations({ workspaceId: "ws-1" })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith(
      "conv-comment",
      expect.objectContaining({
        sinceTime: olderCommentConversation.lastActivityAt,
      }),
    )
    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith(
      "conv-dm",
      expect.objectContaining({
        sinceTime: newerDmConversation.lastActivityAt,
      }),
    )
  })

  test("findConversation anchors sinceTime on the conversation's own lastActivityAt", async () => {
    const conversation = {
      id: "conv-comment",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [
        {
          id: "ci-1",
          contactId: "contact-1",
          lastMessageAt: new Date("2026-06-10T00:00:00Z"),
        },
      ],
    }
    mocks.findWithFullRelations.mockResolvedValue(conversation)

    await findConversation({ id: "conv-comment", workspaceId: "ws-1" })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith(
      "conv-comment",
      expect.objectContaining({
        sinceTime: endOfHour(conversation.lastActivityAt),
      }),
    )
  })
})

describe("listConversations / findConversation attachment count", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMessageRepository.mockResolvedValue(mocks.repo)
    mocks.repo.findLastByConversation.mockResolvedValue([])
    mocks.getCurrentUserAndTargetWorkspace.mockResolvedValue(null)
    mocks.buildConversationWhere.mockReturnValue({})
  })

  test("listConversations requests attachmentCountOnly instead of full attachment rows", async () => {
    const conversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
    }
    mocks.findManyQuery.mockResolvedValue([conversation])

    await listConversations({ workspaceId: "ws-1" })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ attachmentCountOnly: true }),
    )
    expect(mocks.repo.findLastByConversation).not.toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ withAttachments: true }),
    )
  })

  test("findConversation requests attachmentCountOnly instead of full attachment rows", async () => {
    const conversation = {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
    }
    mocks.findWithFullRelations.mockResolvedValue(conversation)

    await findConversation({ id: "conv-1", workspaceId: "ws-1" })

    expect(mocks.repo.findLastByConversation).toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ attachmentCountOnly: true }),
    )
    expect(mocks.repo.findLastByConversation).not.toHaveBeenCalledWith(
      "conv-1",
      expect.objectContaining({ withAttachments: true }),
    )
  })

  test("propagates attachmentCount from the repository into the response", async () => {
    const conversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
    }
    mocks.findManyQuery.mockResolvedValue([conversation])
    mocks.repo.findLastByConversation.mockResolvedValue([
      { id: "msg-1", text: "", attachmentCount: 2, attachments: [] },
    ])

    const result = await listConversations({ workspaceId: "ws-1" })

    expect(result.data[0]?.messages[0]?.attachmentCount).toBe(2)
  })
})
