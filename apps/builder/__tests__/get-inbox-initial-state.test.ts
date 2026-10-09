import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

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

const { loggerWarnMock } = vi.hoisted(() => ({ loggerWarnMock: vi.fn() }))
vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarnMock, error: vi.fn(), info: vi.fn() },
}))

const { getInboxInitialState } = await import(
  "../src/features/chat/queries/get-inbox-initial-state.query"
)

const makeConversation = (id: string, contactId = `contact-${id}`) =>
  ({ id, contact: { id: contactId } }) as never

// Numeric so it survives `zodBigintAsString` and counts as a valid deep link.
const DEEP_LINK_ID = "1"

const makeMessage = (id: string) => ({ id }) as never

const contactPermissionScope = { canViewEmailAndPhone: true }

const getInitialState = (
  input: Omit<
    Parameters<typeof getInboxInitialState>[0],
    "contactPermissionScope"
  >,
) => getInboxInitialState({ ...input, contactPermissionScope })

const mockSeedRequests = () => {
  mockListConversations.mockResolvedValue({
    data: [makeConversation("conversation-1")],
    nextCursor: null,
  })
  mockListMessages.mockResolvedValue({
    data: [makeMessage("message-new"), makeMessage("message-old")],
    nextCursor: null,
  })
  mockGetContact.mockResolvedValue({
    id: "contact-conversation-1",
  })
}

// A deep link to a conversation that is also first in the list.
const mockDeepLinkSeedRequests = () => {
  mockListConversations.mockResolvedValue({
    data: [makeConversation(DEEP_LINK_ID)],
    nextCursor: null,
  })
  mockFindConversation.mockResolvedValue({
    data: makeConversation(DEEP_LINK_ID),
  })
  mockListMessages.mockResolvedValue({
    data: [makeMessage("message-new"), makeMessage("message-old")],
    nextCursor: null,
  })
  mockGetContact.mockResolvedValue({ id: `contact-${DEEP_LINK_ID}` })
}

describe("getInboxInitialState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Opening a thread marks it read, so without a deep link the seed selects
  // nothing and the inbox opens on the empty state.
  test("selects nothing and seeds no thread or contact without a URL id", async () => {
    mockSeedRequests()

    const state = await getInitialState({ workspaceId: "workspace-1" })

    expect(mockFindConversation).not.toHaveBeenCalled()
    expect(mockListMessages).not.toHaveBeenCalled()
    expect(mockGetContact).not.toHaveBeenCalled()
    expect(state).toMatchObject({
      activeConversationId: null,
      conversations: [makeConversation("conversation-1")],
    })
    expect(state).not.toHaveProperty("activeConversationAutoSelected")
    expect(state?.messagesSeed).toBeUndefined()
    expect(state?.seededContact).toBeUndefined()
  })

  test("selects a deep-linked conversation, reverses its messages, and seeds its contact", async () => {
    mockDeepLinkSeedRequests()

    const state = await getInitialState({
      workspaceId: "workspace-1",
      conversationId: DEEP_LINK_ID,
    })

    expect(state).toMatchObject({
      activeConversationId: DEEP_LINK_ID,
      messagesSeed: {
        messages: [makeMessage("message-old"), makeMessage("message-new")],
        messagesConversationId: DEEP_LINK_ID,
      },
      seededContact: { id: `contact-${DEEP_LINK_ID}` },
    })
  })

  test("moves a found URL conversation to the top", async () => {
    const target = makeConversation("2")
    mockListConversations.mockResolvedValue({
      data: [makeConversation("1"), target],
      nextCursor: "next",
    })
    mockFindConversation.mockResolvedValue({ data: target })
    mockListMessages.mockResolvedValue({
      data: [],
      nextCursor: null,
    })
    mockGetContact.mockResolvedValue({ id: "contact-2" })

    const state = await getInitialState({
      workspaceId: "workspace-1",
      conversationId: "2",
    })

    expect(state).toMatchObject({
      activeConversationId: "2",
      conversations: [target, makeConversation("1")],
    })
  })

  test("keeps the listed conversations and logs a warning when the URL conversation lookup rejects", async () => {
    const error = new Error("missing")
    mockSeedRequests()
    mockFindConversation.mockRejectedValue(error)
    const state = await getInitialState({
      workspaceId: "workspace-1",
      conversationId: "404",
    })

    expect(state).toMatchObject({
      activeConversationId: null,
      conversations: [makeConversation("conversation-1")],
    })

    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: error, workspaceId: "workspace-1", conversationId: "404" },
      "getInboxInitialState: failed to find conversation",
    )
  })

  test("does not auto-select a conversation when the URL conversationId is unparseable", async () => {
    mockSeedRequests()

    const state = await getInitialState({
      workspaceId: "workspace-1",
      conversationId: "not-a-bigint",
    })

    expect(mockFindConversation).not.toHaveBeenCalled()
    expect(mockListMessages).not.toHaveBeenCalled()
    expect(mockGetContact).not.toHaveBeenCalled()
    expect(state).toMatchObject({
      activeConversationId: null,
      conversations: [makeConversation("conversation-1")],
    })
    expect(state?.messagesSeed).toBeUndefined()
    expect(state?.seededContact).toBeUndefined()
  })

  test("returns the remaining seed when loading messages rejects", async () => {
    mockDeepLinkSeedRequests()
    mockListMessages.mockRejectedValue(new Error("messages failed"))

    const state = await getInitialState({
      workspaceId: "workspace-1",
      conversationId: DEEP_LINK_ID,
    })

    expect(state).toMatchObject({
      activeConversationId: DEEP_LINK_ID,
      seededContact: { id: `contact-${DEEP_LINK_ID}` },
    })
    expect(state).not.toHaveProperty("messagesSeed")
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        workspaceId: "workspace-1",
        conversationId: DEEP_LINK_ID,
      }),
      "getInboxInitialState: failed to seed messages state",
    )
  })

  test("returns null and logs a warning when listing conversations rejects", async () => {
    const error = new Error("conversations failed")
    mockListConversations.mockRejectedValue(error)

    await expect(
      getInitialState({ workspaceId: "workspace-1" }),
    ).resolves.toBeNull()

    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: error, workspaceId: "workspace-1", conversationId: undefined },
      "getInboxInitialState: failed to list conversations",
    )
  })

  test("passes the contact permission scope to the contact seed", async () => {
    mockDeepLinkSeedRequests()

    await getInitialState({
      workspaceId: "workspace-1",
      conversationId: DEEP_LINK_ID,
    })

    expect(mockGetContact).toHaveBeenCalledWith(
      { contactId: `contact-${DEEP_LINK_ID}`, workspaceId: "workspace-1" },
      contactPermissionScope,
    )
  })

  test("passes an assigned-user restriction to the contact seed", async () => {
    const restrictedScope = {
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: "user-1",
    }
    mockDeepLinkSeedRequests()

    await getInboxInitialState({
      workspaceId: "workspace-1",
      conversationId: DEEP_LINK_ID,
      contactPermissionScope: restrictedScope,
    })

    expect(mockGetContact).toHaveBeenCalledWith(
      { contactId: `contact-${DEEP_LINK_ID}`, workspaceId: "workspace-1" },
      restrictedScope,
    )
  })

  test("returns null and logs the timeout error when the seed never resolves", async () => {
    vi.useFakeTimers()
    mockListConversations.mockImplementation(
      () => Promise.withResolvers<never>().promise,
    )

    const seed = getInitialState({ workspaceId: "workspace-1" })
    await vi.advanceTimersByTimeAsync(3000)

    await expect(seed).resolves.toBeNull()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "getInboxInitialState: failed to seed inbox state",
    )
  })

  test("clears the seed timeout when the requests resolve before it", async () => {
    vi.useFakeTimers()
    mockSeedRequests()

    await getInitialState({ workspaceId: "workspace-1" })

    expect(vi.getTimerCount()).toBe(0)
  })
})
