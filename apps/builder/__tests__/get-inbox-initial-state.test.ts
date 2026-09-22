import { beforeEach, expect, test, vi } from "vitest"

const {
  mockFindConversation,
  mockGetContact,
  mockListConversations,
  mockListMessages,
} = vi.hoisted(() => ({
  mockFindConversation: vi.fn(),
  mockGetContact: vi.fn(),
  mockListConversations: vi.fn(),
  mockListMessages: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}))
vi.mock("@/features/conversations/queries/list-conversations.query", () => ({
  findConversation: mockFindConversation,
  listConversations: mockListConversations,
}))
vi.mock("@/features/messages/queries", () => ({
  listMessages: mockListMessages,
}))
vi.mock("@/features/contacts/queries/get-contact.query", () => ({
  getContact: mockGetContact,
}))

import { getInboxInitialState } from "@/features/chat/queries/get-inbox-initial-state.query"

const makeConversation = (id: string) =>
  ({
    id,
    contact: { id: `contact-${id}` },
  }) as never

const contactPermissionScope = {
  canViewEmailAndPhone: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetContact.mockResolvedValue({ id: "contact-conversation-1" })
  mockListMessages.mockResolvedValue({ data: [], nextCursor: null })
})

test("seeds the first listed conversation when no deep link is present", async () => {
  const conversation = makeConversation("conversation-1")
  mockListConversations.mockResolvedValue({
    data: [conversation],
    nextCursor: "cursor-2",
  })

  const state = await getInboxInitialState({
    workspaceId: "workspace-1",
    canViewEmailAndPhone: false,
    contactPermissionScope,
  })

  expect(state).toMatchObject({
    activeConversationId: "conversation-1",
    activeConversationAutoSelected: true,
    conversations: [conversation],
    messagesConversationId: "conversation-1",
  })
  expect(mockListConversations).toHaveBeenCalledWith(
    {
      workspaceId: "workspace-1",
      perPage: 20,
      cursor: "",
    },
    { includeEmailAndPhone: false },
  )
  expect(mockFindConversation).not.toHaveBeenCalled()
})

test("moves a deep-linked conversation to the front without duplicating it", async () => {
  const deepLinked = makeConversation("2")
  mockListConversations.mockResolvedValue({
    data: [makeConversation("1"), deepLinked],
    nextCursor: null,
  })
  mockFindConversation.mockResolvedValue({ data: deepLinked })

  const state = await getInboxInitialState({
    workspaceId: "workspace-1",
    canViewEmailAndPhone: true,
    conversationId: "2",
    contactPermissionScope,
  })

  expect(state?.conversations?.map((conversation) => conversation.id)).toEqual([
    "2",
    "1",
  ])
  expect(state?.activeConversationId).toBe("2")
})

test("ignores an invalid deep-link id and seeds the listed conversation", async () => {
  mockListConversations.mockResolvedValue({
    data: [makeConversation("conversation-1")],
    nextCursor: null,
  })

  const state = await getInboxInitialState({
    workspaceId: "workspace-1",
    canViewEmailAndPhone: true,
    conversationId: "not-a-bigint",
    contactPermissionScope,
  })

  expect(state?.activeConversationId).toBe("conversation-1")
  expect(mockFindConversation).not.toHaveBeenCalled()
})

test("skips conversation details when the mobile layout discards selection", async () => {
  const conversation = makeConversation("conversation-1")
  mockListConversations.mockResolvedValue({
    data: [conversation],
    nextCursor: null,
  })

  const state = await getInboxInitialState({
    workspaceId: "workspace-1",
    canViewEmailAndPhone: true,
    contactPermissionScope,
    seedConversationDetails: false,
  })

  expect(state).toMatchObject({
    activeConversationId: "conversation-1",
    conversations: [conversation],
  })
  expect(mockListMessages).not.toHaveBeenCalled()
  expect(mockGetContact).not.toHaveBeenCalled()
})
