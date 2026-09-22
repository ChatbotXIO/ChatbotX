import { afterEach, beforeEach, expect, test, vi } from "vitest"

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
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    contactsAPIs: { getContactAuthenticatedAPI: mockGetContact },
    conversationsAPI: {
      findConversationAuthenticatedAPI: mockFindConversation,
      listConversationsByPOSTAuthenticatedAPI: mockListConversations,
    },
    messagesAPI: { listMessagesAuthenticatedAPI: mockListMessages },
  },
}))

import { getInboxInitialState } from "@/features/chat/queries/get-inbox-initial-state.query"

const serverClientGlobal = globalThis as typeof globalThis & {
  $client?: unknown
}

// The query function only checks this server-client sentinel for truthiness;
// every procedure call is mocked above.
const availableServerClient = {} as typeof globalThis.$client

const makeConversation = (id: string) =>
  ({
    id,
    contact: { id: `contact-${id}` },
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
  serverClientGlobal.$client = availableServerClient
  mockGetContact.mockResolvedValue({ id: "contact-conversation-1" })
  mockListMessages.mockResolvedValue({ data: [], nextCursor: null })
})

afterEach(() => {
  serverClientGlobal.$client = undefined
})

test("seeds the first listed conversation when no deep link is present", async () => {
  const conversation = makeConversation("conversation-1")
  mockListConversations.mockResolvedValue({
    data: [conversation],
    nextCursor: "cursor-2",
  })

  const state = await getInboxInitialState({ workspaceId: "workspace-1" })

  expect(state).toMatchObject({
    activeConversationId: "conversation-1",
    activeConversationAutoSelected: true,
    conversations: [conversation],
    messagesConversationId: "conversation-1",
  })
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
    conversationId: "2",
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
    conversationId: "not-a-bigint",
  })

  expect(state?.activeConversationId).toBe("conversation-1")
  expect(mockFindConversation).not.toHaveBeenCalled()
})

test("falls back to client loading when the server oRPC client is unavailable", async () => {
  serverClientGlobal.$client = undefined

  await expect(
    getInboxInitialState({ workspaceId: "workspace-1" }),
  ).resolves.toBeNull()
  expect(mockListConversations).not.toHaveBeenCalled()
})
