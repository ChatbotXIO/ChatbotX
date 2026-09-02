// @vitest-environment node

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

const adAttributedContactInbox = {
  id: "ci-ad",
  contactId: "contact-1",
  inboxId: "inbox-1",
  channel: "whatsapp",
  source: "whatsapp",
  sourceId: "source-1",
  language: null,
  lastIncomingMessageAt: null,
  contactLastReadAt: null,
  inbox: { name: "WhatsApp Inbox" },
  referral: {
    ctwaClid: "clid-123",
    adTitle: "Summer Sale",
    sourceUrl: "https://fb.com/ad/xyz",
    raw: { secret: "should-never-leave-the-server" },
  },
}

const organicContactInbox = {
  id: "ci-organic",
  contactId: "contact-1",
  inboxId: "inbox-1",
  channel: "messenger",
  source: "messenger",
  sourceId: "source-2",
  language: null,
  lastIncomingMessageAt: null,
  contactLastReadAt: null,
  inbox: { name: "Messenger Inbox" },
  referral: null,
}

describe("listConversations / findConversation adReferral mapping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createMessageRepository.mockResolvedValue(mocks.repo)
    mocks.repo.findLastByConversation.mockResolvedValue([])
    mocks.getCurrentUserAndTargetWorkspace.mockResolvedValue(null)
    mocks.buildConversationWhere.mockReturnValue({})
  })

  test("listConversations maps an ad-attributed contactInbox to a non-null adReferral", async () => {
    const conversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [adAttributedContactInbox, organicContactInbox],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
    }
    mocks.findManyQuery.mockResolvedValue([conversation])

    const result = await listConversations({ workspaceId: "ws-1" })

    const mappedContactInboxes = result.data[0]?.contactInboxes ?? []
    expect(mappedContactInboxes[0]?.adReferral).toEqual({
      adTitle: "Summer Sale",
      sourceUrl: "https://fb.com/ad/xyz",
    })
    expect(mappedContactInboxes[1]?.adReferral).toBeNull()
  })

  test("listConversations strips the raw referral field from the mapped output", async () => {
    const conversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [adAttributedContactInbox],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
    }
    mocks.findManyQuery.mockResolvedValue([conversation])

    const result = await listConversations({ workspaceId: "ws-1" })

    const mappedContactInbox = result.data[0]?.contactInboxes[0]
    expect(mappedContactInbox).not.toHaveProperty("referral")
  })

  test("findConversation maps an ad-attributed contactInbox to a non-null adReferral", async () => {
    const conversation = {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [adAttributedContactInbox, organicContactInbox],
    }
    mocks.findWithFullRelations.mockResolvedValue(conversation)

    const result = await findConversation({ id: "conv-1", workspaceId: "ws-1" })

    const mappedContactInboxes = result.data.contactInboxes
    expect(mappedContactInboxes[0]?.adReferral).toEqual({
      adTitle: "Summer Sale",
      sourceUrl: "https://fb.com/ad/xyz",
    })
    expect(mappedContactInboxes[1]?.adReferral).toBeNull()
  })

  test("findConversation strips the raw referral field from the mapped output", async () => {
    const conversation = {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [adAttributedContactInbox],
    }
    mocks.findWithFullRelations.mockResolvedValue(conversation)

    const result = await findConversation({ id: "conv-1", workspaceId: "ws-1" })

    const mappedContactInbox = result.data.contactInboxes[0]
    expect(mappedContactInbox).not.toHaveProperty("referral")
  })

  test("produces the identical contactInbox shape on both the list and find paths", async () => {
    const listConversation = {
      id: "conv-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [adAttributedContactInbox],
      contact: null,
      assignedUser: null,
      assignedInboxTeam: null,
    }
    mocks.findManyQuery.mockResolvedValue([listConversation])
    const listResult = await listConversations({ workspaceId: "ws-1" })

    const findConversationRow = {
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: new Date("2026-01-01T00:00:00Z"),
      contactInboxes: [adAttributedContactInbox],
    }
    mocks.findWithFullRelations.mockResolvedValue(findConversationRow)
    const findResult = await findConversation({
      id: "conv-1",
      workspaceId: "ws-1",
    })

    expect(
      Object.keys(listResult.data[0]?.contactInboxes[0] ?? {}).sort(),
    ).toEqual(Object.keys(findResult.data.contactInboxes[0] ?? {}).sort())
  })
})
