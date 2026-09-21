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

describe("getInboxInitialState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()

  })

  afterEach(() => {
    vi.useRealTimers()

  })

  test("selects the first conversation, reverses messages, and seeds its contact without a URL id", async () => {
    mockSeedRequests()

    const state = await getInitialState({ workspaceId: "workspace-1" })

    expect(state).toMatchObject({
      activeConversationAutoSelected: true,
      activeConversationId: "conversation-1",
      messages: [makeMessage("message-old"), makeMessage("message-new")],
      messagesConversationId: "conversation-1",
      seededContact: { id: "contact-conversation-1" },
    })
  })

  test("moves a found URL conversation to the top without marking it auto-selected", async () => {
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
      activeConversationAutoSelected: false,
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
      activeConversationAutoSelected: false,
      activeConversationId: null,
      conversations: [makeConversation("conversation-1")],
    })

    expect(loggerWarnMock).toHaveBeenCalledWith(
      { err: error, workspaceId: "workspace-1", conversationId: "404" },
      "getInboxInitialState: failed to find conversation",
    )
  })

  test("returns the remaining seed when loading messages rejects", async () => {
    mockSeedRequests()
    mockListMessages.mockRejectedValue(new Error("messages failed"))

    const state = await getInitialState({ workspaceId: "workspace-1" })

    expect(state).toMatchObject({
      activeConversationId: "conversation-1",
      seededContact: { id: "contact-conversation-1" },
    })
    expect(state).not.toHaveProperty("messages")
    expect(state).not.toHaveProperty("messagesConversationId")
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
    mockSeedRequests()

    await getInitialState({ workspaceId: "workspace-1" })

    expect(mockGetContact).toHaveBeenCalledWith(
      { contactId: "contact-conversation-1", workspaceId: "workspace-1" },
      contactPermissionScope,
    )
  })

  test("passes an assigned-user restriction to the contact seed", async () => {
    const restrictedScope = {
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: "user-1",
    }
    mockSeedRequests()

    await getInboxInitialState({
      workspaceId: "workspace-1",
      contactPermissionScope: restrictedScope,
    })

    expect(mockGetContact).toHaveBeenCalledWith(
      { contactId: "contact-conversation-1", workspaceId: "workspace-1" },
      restrictedScope,
    )
  })

  test("returns null and logs the timeout error when the seed never resolves", async () => {
    vi.useFakeTimers()
    mockListConversations.mockImplementation(
      () => Promise.withResolvers<never>().promise,
    )

    const seed = getInitialState({ workspaceId: "workspace-1" })
    await vi.advanceTimersByTimeAsync(8000)

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
