import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindConversationAuthenticatedAPI,
  mockGetContactAuthenticatedAPI,
  mockListConversationsByPOSTAuthenticatedAPI,
  mockListMessagesAuthenticatedAPI,
} = vi.hoisted(() => ({
  mockFindConversationAuthenticatedAPI: vi.fn(),
  mockGetContactAuthenticatedAPI: vi.fn(),
  mockListConversationsByPOSTAuthenticatedAPI: vi.fn(),
  mockListMessagesAuthenticatedAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    contactsAPIs: {
      getContactAuthenticatedAPI: mockGetContactAuthenticatedAPI,
    },
    conversationsAPI: {
      findConversationAuthenticatedAPI: mockFindConversationAuthenticatedAPI,
      listConversationsByPOSTAuthenticatedAPI:
        mockListConversationsByPOSTAuthenticatedAPI,
    },
    messagesAPI: {
      listMessagesAuthenticatedAPI: mockListMessagesAuthenticatedAPI,
    },
  },
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

const mockSeedRequests = () => {
  mockListConversationsByPOSTAuthenticatedAPI.mockResolvedValue({
    data: [makeConversation("conversation-1")],
    nextCursor: null,
  })
  mockListMessagesAuthenticatedAPI.mockResolvedValue({
    data: [makeMessage("message-new"), makeMessage("message-old")],
    nextCursor: null,
  })
  mockGetContactAuthenticatedAPI.mockResolvedValue({
    id: "contact-conversation-1",
  })
}

describe("getInboxInitialState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.stubGlobal("$client", {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test("selects the first conversation, reverses messages, and seeds its contact without a URL id", async () => {
    mockSeedRequests()

    const state = await getInboxInitialState({ workspaceId: "workspace-1" })

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
    mockListConversationsByPOSTAuthenticatedAPI.mockResolvedValue({
      data: [makeConversation("1"), target],
      nextCursor: "next",
    })
    mockFindConversationAuthenticatedAPI.mockResolvedValue({ data: target })
    mockListMessagesAuthenticatedAPI.mockResolvedValue({
      data: [],
      nextCursor: null,
    })
    mockGetContactAuthenticatedAPI.mockResolvedValue({ id: "contact-2" })

    const state = await getInboxInitialState({
      workspaceId: "workspace-1",
      conversationId: "2",
    })

    expect(state).toMatchObject({
      activeConversationAutoSelected: false,
      activeConversationId: "2",
      conversations: [target, makeConversation("1")],
    })
  })

  test("keeps the listed conversations when the URL conversation lookup rejects", async () => {
    mockSeedRequests()
    mockFindConversationAuthenticatedAPI.mockRejectedValue(new Error("missing"))

    const state = await getInboxInitialState({
      workspaceId: "workspace-1",
      conversationId: "404",
    })

    expect(state).toMatchObject({
      activeConversationAutoSelected: false,
      activeConversationId: null,
      conversations: [makeConversation("conversation-1")],
    })
  })

  test("returns the remaining seed when loading messages rejects", async () => {
    mockSeedRequests()
    mockListMessagesAuthenticatedAPI.mockRejectedValue(
      new Error("messages failed"),
    )

    const state = await getInboxInitialState({ workspaceId: "workspace-1" })

    expect(state).toMatchObject({
      activeConversationId: "conversation-1",
      seededContact: { id: "contact-conversation-1" },
    })
    expect(state).not.toHaveProperty("messages")
    expect(state).not.toHaveProperty("messagesConversationId")
  })

  test("returns null when listing conversations rejects", async () => {
    mockListConversationsByPOSTAuthenticatedAPI.mockRejectedValue(
      new Error("conversations failed"),
    )

    await expect(
      getInboxInitialState({ workspaceId: "workspace-1" }),
    ).resolves.toBeNull()
  })

  test("returns null and logs a warning when the server oRPC client is unavailable", async () => {
    vi.stubGlobal("$client", undefined)

    await expect(
      getInboxInitialState({ workspaceId: "workspace-1" }),
    ).resolves.toBeNull()

    expect(loggerWarnMock).toHaveBeenCalledWith(
      { conversationId: undefined, workspaceId: "workspace-1" },
      "getInboxInitialState: server oRPC client is unavailable",
    )
  })

  test("returns null and logs the timeout error when the seed never resolves", async () => {
    vi.useFakeTimers()
    mockListConversationsByPOSTAuthenticatedAPI.mockImplementation(
      () => Promise.withResolvers<never>().promise,
    )

    const seed = getInboxInitialState({ workspaceId: "workspace-1" })
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

    await getInboxInitialState({ workspaceId: "workspace-1" })

    expect(vi.getTimerCount()).toBe(0)
  })
})
