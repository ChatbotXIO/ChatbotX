import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockFindConversationAuthenticatedAPI,
  mockListConversationsByPOSTAuthenticatedAPI,
  mockListMessagesAuthenticatedAPI,
} = vi.hoisted(() => ({
  mockFindConversationAuthenticatedAPI: vi.fn(),
  mockListConversationsByPOSTAuthenticatedAPI: vi.fn(),
  mockListMessagesAuthenticatedAPI: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
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

const { createChatStore } = await import(
  "../src/features/chat/store/chat-store"
)

type TestConversation = {
  id: string
  workspaceId: string
  contactId: string
  messages: unknown[]
  lastActivityAt: Date | null
  agentLastReadAt?: Date | null
  adminRepliedAt?: Date | null
}

type TestMessage = {
  id: string
  workspaceId: string
  conversationId: string
  createdAt: Date
  messageType: string
  senderType?: string
  senderId?: string | null
}

const makeConversation = (id: string, lastActivityAt: Date) =>
  ({
    id,
    workspaceId: "ws-1",
    contactId: `contact-${id}`,
    messages: [],
    lastActivityAt,
  }) as TestConversation

const makeMessage = (conversationId: string, createdAt: Date) =>
  ({
    id: `msg-${conversationId}`,
    workspaceId: "ws-1",
    conversationId,
    createdAt,
    messageType: "incoming",
  }) as TestMessage

const makeOutgoingMessage = (
  conversationId: string,
  createdAt: Date,
  senderType: "user" | "api" | "bot" | "system",
  // `received-message` stamps a channel echo senderType "user" with a null
  // senderId; `createOutgoing` always carries the acting user's id.
  senderId: string | null = senderType === "user" ? "user-1" : null,
) =>
  ({
    ...makeMessage(conversationId, createdAt),
    id: `msg-${conversationId}-${senderType}`,
    messageType: "outgoing",
    senderType,
    senderId,
  }) as TestMessage

const setConversationUrl = (conversationId: string | null) => {
  window.history.replaceState(
    {},
    "",
    conversationId ? `/?conversationId=${conversationId}` : "/",
  )
}

const mockConversationPage = (
  conversations: TestConversation[],
  nextCursor: string | null = null,
) => {
  mockListConversationsByPOSTAuthenticatedAPI.mockResolvedValue({
    data: conversations,
    nextCursor,
  })
}

describe("chat store conversation updates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setConversationUrl(null)
  })

  test("initActiveConversationFromUrl moves an already loaded conversation to the top without fetching it", async () => {
    const store = createChatStore()
    const first = makeConversation(
      "conv-first",
      new Date("2026-01-01T00:00:00Z"),
    )
    const loaded = makeConversation(
      "conv-deep-link",
      new Date("2026-01-01T01:00:00Z"),
    )
    store.setState({
      conversations: [first, loaded] as never,
      messages: [
        makeMessage("conv-first", new Date("2026-01-01T02:00:00Z")),
      ] as never,
    })
    setConversationUrl("conv-deep-link")

    await store.getState().initActiveConversationFromUrl("ws-1")

    expect(mockFindConversationAuthenticatedAPI).not.toHaveBeenCalled()
    expect(store.getState().activeConversationId).toBe("conv-deep-link")
    expect(store.getState().isBootstrappingUrlConversation).toBe(false)
    expect(store.getState().conversations).toEqual([loaded, first])
    expect(store.getState().messages).toEqual([])
  })

  test("initActiveConversationFromUrl fetches, prepends, and selects a missing conversation", async () => {
    const store = createChatStore()
    const existing = makeConversation(
      "conv-existing",
      new Date("2026-01-01T00:00:00Z"),
    )
    const deepLinked = makeConversation(
      "conv-deep-link",
      new Date("2026-01-02T00:00:00Z"),
    )
    store.setState({ conversations: [existing] as never })
    setConversationUrl("conv-deep-link")
    mockFindConversationAuthenticatedAPI.mockResolvedValue({ data: deepLinked })

    await store.getState().initActiveConversationFromUrl("ws-1")

    expect(mockFindConversationAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-deep-link",
    })
    expect(store.getState().conversations).toEqual([deepLinked, existing])
    expect(store.getState().activeConversationId).toBe("conv-deep-link")
    expect(store.getState().isBootstrappingUrlConversation).toBe(false)
  })

  test("initActiveConversationFromUrl leaves selection empty when the URL conversation cannot be loaded", async () => {
    const store = createChatStore()
    setConversationUrl("conv-missing")
    mockFindConversationAuthenticatedAPI.mockRejectedValue(new Error("missing"))

    await store.getState().initActiveConversationFromUrl("ws-1")

    expect(mockFindConversationAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-missing",
    })
    expect(store.getState().activeConversationId).toBeNull()
    expect(store.getState().isBootstrappingUrlConversation).toBe(false)
  })

  test("openConversation selects an already-loaded conversation without fetching it", async () => {
    const store = createChatStore()
    const first = makeConversation(
      "conv-first",
      new Date("2026-01-01T00:00:00Z"),
    )
    const target = makeConversation(
      "conv-target",
      new Date("2026-01-01T01:00:00Z"),
    )
    store.setState({ conversations: [first, target] as never })

    await store.getState().openConversation("ws-1", "conv-target")

    expect(mockFindConversationAuthenticatedAPI).not.toHaveBeenCalled()
    expect(store.getState().activeConversationId).toBe("conv-target")
    expect(store.getState().conversations).toEqual([target, first])
    expect(store.getState().isBootstrappingUrlConversation).toBe(false)
  })

  test("openConversation fetches, prepends, and selects a missing conversation", async () => {
    const store = createChatStore()
    const existing = makeConversation(
      "conv-existing",
      new Date("2026-01-01T00:00:00Z"),
    )
    const target = makeConversation(
      "conv-target",
      new Date("2026-01-02T00:00:00Z"),
    )
    store.setState({ conversations: [existing] as never })
    mockFindConversationAuthenticatedAPI.mockResolvedValue({ data: target })

    await store.getState().openConversation("ws-1", "conv-target")

    expect(mockFindConversationAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-target",
    })
    expect(store.getState().conversations).toEqual([target, existing])
    expect(store.getState().activeConversationId).toBe("conv-target")
    expect(store.getState().isBootstrappingUrlConversation).toBe(false)
  })

  // `openConversation` must not silently no-op while
  // `isBootstrappingUrlConversation` is true: `chat-realtime.tsx`'s bridge has
  // already set the `conversationId` URL param, so a no-op would leave the
  // URL and the actual selection disagreeing. It must wait the bootstrap out
  // and then proceed.
  test("openConversation waits out an in-flight bootstrap instead of no-oping", async () => {
    const store = createChatStore()
    const target = makeConversation(
      "conv-target",
      new Date("2026-01-01T00:00:00Z"),
    )
    store.setState({ isBootstrappingUrlConversation: true })

    const openPromise = store.getState().openConversation("ws-1", "conv-target")

    // Still bootstrapping — must not have proceeded yet.
    expect(mockFindConversationAuthenticatedAPI).not.toHaveBeenCalled()

    mockFindConversationAuthenticatedAPI.mockResolvedValue({ data: target })
    store.setState({ isBootstrappingUrlConversation: false })

    await openPromise

    expect(mockFindConversationAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-target",
    })
    expect(store.getState().activeConversationId).toBe("conv-target")
    expect(store.getState().isBootstrappingUrlConversation).toBe(false)
  })

  // Two `openConversation` calls queued behind the SAME in-flight bootstrap
  // must not both proceed once it clears, racing for whichever finishes
  // last. The last REQUESTED call owns the load; an earlier, now-superseded call must
  // resolve `false` without fetching anything.
  test("openConversation resolves false for an earlier-queued call once a newer one supersedes it", async () => {
    const store = createChatStore()
    const convA = makeConversation("conv-a", new Date("2026-01-01T00:00:00Z"))
    const convB = makeConversation("conv-b", new Date("2026-01-01T01:00:00Z"))
    mockFindConversationAuthenticatedAPI.mockImplementation(
      async ({ id }: { id: string }) => ({
        data: id === "conv-a" ? convA : convB,
      }),
    )
    store.setState({ isBootstrappingUrlConversation: true })

    const openA = store.getState().openConversation("ws-1", "conv-a")
    const openB = store.getState().openConversation("ws-1", "conv-b")

    store.setState({ isBootstrappingUrlConversation: false })

    const [resultA, resultB] = await Promise.all([openA, openB])

    expect(resultA).toBe(false)
    expect(resultB).toBe(true)
    expect(mockFindConversationAuthenticatedAPI).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "conv-a" }),
    )
    expect(mockFindConversationAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-b",
    })
    expect(store.getState().activeConversationId).toBe("conv-b")
  })

  test("openConversation is a no-op when the conversation is already active", async () => {
    const store = createChatStore()
    store.setState({ activeConversationId: "conv-target" })

    await store.getState().openConversation("ws-1", "conv-target")

    expect(mockFindConversationAuthenticatedAPI).not.toHaveBeenCalled()
  })

  test("openConversation logs and leaves selection unchanged when the fetch fails", async () => {
    const store = createChatStore()
    mockFindConversationAuthenticatedAPI.mockRejectedValue(new Error("missing"))

    await store.getState().openConversation("ws-1", "conv-missing")

    expect(store.getState().activeConversationId).toBeNull()
    expect(store.getState().isBootstrappingUrlConversation).toBe(false)
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-missing" }),
      expect.any(String),
    )
  })

  test("initActiveConversationFromUrl is a no-op without a conversation id in the URL", async () => {
    const store = createChatStore()

    await store.getState().initActiveConversationFromUrl("ws-1")

    expect(mockFindConversationAuthenticatedAPI).not.toHaveBeenCalled()
    expect(store.getState().activeConversationId).toBeNull()
    expect(store.getState().isBootstrappingUrlConversation).toBe(false)
  })

  test("loadMoreConversations appends only conversations not already present", async () => {
    const store = createChatStore()
    const existing = makeConversation(
      "conv-1",
      new Date("2026-01-01T00:00:00Z"),
    )
    const duplicate = {
      ...existing,
      messages: [{ id: "fresh-message" }],
    }
    const next = makeConversation("conv-2", new Date("2026-01-01T01:00:00Z"))
    store.setState({
      conversations: [existing] as never,
      nextCursorConversation: "cursor-1",
    })
    mockConversationPage([duplicate, next] as TestConversation[])

    await store.getState().loadMoreConversations("ws-1")

    expect(store.getState().conversations.map((c) => c.id)).toEqual([
      "conv-1",
      "conv-2",
    ])
    expect(store.getState().conversations[0]).toBe(existing)
  })

  test("loadMoreConversations does not auto-select the first item when a URL conversation id exists", async () => {
    const store = createChatStore()
    const first = makeConversation("conv-1", new Date("2026-01-01T00:00:00Z"))
    setConversationUrl("conv-missing")
    mockConversationPage([first])

    await store.getState().loadMoreConversations("ws-1")

    expect(store.getState().activeConversationId).toBeNull()
  })

  test("loadMoreConversations can ignore the URL conversation id for filter reloads", async () => {
    const store = createChatStore()
    const first = makeConversation("conv-1", new Date("2026-01-01T00:00:00Z"))
    setConversationUrl("conv-missing")
    mockConversationPage([first])

    await store
      .getState()
      .loadMoreConversations("ws-1", { respectUrlConversationId: false })

    expect(store.getState().activeConversationId).toBe("conv-1")
  })

  test("loadMoreConversations auto-selects the first item when the URL has no conversation id", async () => {
    const store = createChatStore()
    const first = makeConversation("conv-1", new Date("2026-01-01T00:00:00Z"))
    store.setState({
      messages: [
        makeMessage("conv-old", new Date("2026-01-01T01:00:00Z")),
      ] as never,
    })
    mockConversationPage([first])

    await store.getState().loadMoreConversations("ws-1")

    expect(store.getState().activeConversationId).toBe("conv-1")
    expect(store.getState().messages).toEqual([])
    expect(store.getState().activeConversationAutoSelected).toBe(true)
  })

  test("initActiveConversationFromUrl waits for the first page before fetching a URL conversation", async () => {
    const store = createChatStore()
    const first = makeConversation("conv-1", new Date("2026-01-01T00:00:00Z"))
    const deepLinked = makeConversation(
      "conv-deep-link",
      new Date("2026-01-01T01:00:00Z"),
    )
    type PageResponse = {
      data: TestConversation[]
      nextCursor: string | null
    }
    let resolvePage: (value: PageResponse) => void = () => {
      throw new Error("Page resolver was not initialized")
    }
    const pageResponse = new Promise<PageResponse>((resolve) => {
      resolvePage = resolve
    })
    setConversationUrl("conv-deep-link")
    mockListConversationsByPOSTAuthenticatedAPI.mockReturnValue(pageResponse)

    const loadPromise = store.getState().loadMoreConversations("ws-1")
    const bootstrapPromise = store
      .getState()
      .initActiveConversationFromUrl("ws-1")
    resolvePage({ data: [first, deepLinked], nextCursor: null })
    await Promise.all([loadPromise, bootstrapPromise])

    expect(mockFindConversationAuthenticatedAPI).not.toHaveBeenCalled()
    expect(store.getState().activeConversationId).toBe("conv-deep-link")
    expect(store.getState().conversations).toEqual([deepLinked, first])
  })

  test("initActiveConversationFromUrl continues when the first page request fails", async () => {
    const store = createChatStore()
    const deepLinked = makeConversation(
      "conv-deep-link",
      new Date("2026-01-01T01:00:00Z"),
    )
    setConversationUrl("conv-deep-link")
    mockListConversationsByPOSTAuthenticatedAPI.mockRejectedValue(
      new Error("list failed"),
    )
    mockFindConversationAuthenticatedAPI.mockResolvedValue({ data: deepLinked })

    const loadPromise = store
      .getState()
      .loadMoreConversations("ws-1")
      .catch(() => undefined)
    const bootstrapPromise = store
      .getState()
      .initActiveConversationFromUrl("ws-1")

    await Promise.all([loadPromise, bootstrapPromise])

    expect(mockFindConversationAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-deep-link",
    })
    expect(store.getState().activeConversationId).toBe("conv-deep-link")
    expect(store.getState().isLoadingConversation).toBe(false)
    expect(store.getState().isBootstrappingUrlConversation).toBe(false)
  })

  test("loadMoreConversations keeps a conversation prepended while the page request was in flight", async () => {
    const store = createChatStore()
    const deepLinked = makeConversation(
      "conv-deep-link",
      new Date("2026-01-02T00:00:00Z"),
    )
    const firstPageItem = makeConversation(
      "conv-page-1",
      new Date("2026-01-01T00:00:00Z"),
    )
    type PageResponse = {
      data: TestConversation[]
      nextCursor: string | null
    }
    let resolvePage: (value: PageResponse) => void = () => {
      throw new Error("Page resolver was not initialized")
    }
    const pageResponse = new Promise<PageResponse>((resolve) => {
      resolvePage = resolve
    })
    mockListConversationsByPOSTAuthenticatedAPI.mockReturnValue(pageResponse)

    const loadPromise = store.getState().loadMoreConversations("ws-1")
    store.getState().prependConversation(deepLinked as never)
    resolvePage({ data: [firstPageItem], nextCursor: null })
    await loadPromise

    expect(store.getState().conversations.map((c) => c.id)).toEqual([
      "conv-deep-link",
      "conv-page-1",
    ])
  })

  test("updateConversationViaMessage moves an existing conversation to the top and refreshes lastActivityAt", async () => {
    const store = createChatStore()
    const oldFirst = makeConversation(
      "conv-1",
      new Date("2026-01-01T00:00:00Z"),
    )
    const target = makeConversation("conv-2", new Date("2026-01-01T01:00:00Z"))
    const originalList = [oldFirst, target]
    store.setState({ conversations: originalList as never })

    const message = makeMessage("conv-2", new Date("2026-01-02T00:00:00Z"))
    await store.getState().updateConversationViaMessage(message as never)

    const conversations = store.getState().conversations
    expect(conversations).not.toBe(originalList)
    expect(conversations.map((c) => c.id)).toEqual(["conv-2", "conv-1"])
    expect(conversations[0].messages).toEqual([message])
    expect(conversations[0].lastActivityAt).toBe(message.createdAt)
    expect(conversations[1]).toBe(oldFirst)
  })

  test("updateConversationViaMessage fetches and prepends a missing conversation", async () => {
    const store = createChatStore()
    const existing = makeConversation(
      "conv-1",
      new Date("2026-01-01T00:00:00Z"),
    )
    const fetched = makeConversation(
      "conv-new",
      new Date("2026-01-01T02:00:00Z"),
    )
    store.setState({ conversations: [existing] as never })
    mockFindConversationAuthenticatedAPI.mockResolvedValue({ data: fetched })

    const message = makeMessage("conv-new", new Date("2026-01-02T00:00:00Z"))
    await store.getState().updateConversationViaMessage(message as never)

    expect(mockFindConversationAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-new",
    })
    expect(store.getState().conversations).toEqual([
      { ...fetched, messages: [message] },
      existing,
    ])
  })

  test("updateConversation merges partial data without touching other conversations", () => {
    const store = createChatStore()
    const first = makeConversation("conv-1", new Date("2026-01-01T00:00:00Z"))
    const second = makeConversation("conv-2", new Date("2026-01-01T01:00:00Z"))
    store.setState({ conversations: [first, second] as never })

    store.getState().updateConversation("conv-2", {
      agentLastReadAt: new Date("2026-01-02T00:00:00Z"),
    })

    const conversations = store.getState().conversations
    expect(conversations[0]).toBe(first)
    expect(conversations[1]).toEqual({
      ...second,
      agentLastReadAt: new Date("2026-01-02T00:00:00Z"),
    })
  })

  test("bubbleConversationToTop moves an already-loaded conversation to the front without touching lastActivityAt or the cursor", async () => {
    const store = createChatStore()
    const oldFirst = makeConversation(
      "conv-1",
      new Date("2026-01-01T00:00:00Z"),
    )
    const target = makeConversation("conv-2", new Date("2026-01-01T01:00:00Z"))
    store.setState({
      conversations: [oldFirst, target] as never,
      nextCursorConversation: "cursor-abc",
    })

    await store.getState().bubbleConversationToTop("ws-1", "conv-2")

    const state = store.getState()
    expect(state.conversations.map((c) => c.id)).toEqual(["conv-2", "conv-1"])
    // Unlike `updateConversationViaMessage`, this is a purely visual reorder:
    // no fabricated `lastActivityAt` and no message payload attached.
    expect(state.conversations[0].lastActivityAt).toEqual(target.lastActivityAt)
    expect(state.conversations[0].messages).toEqual(target.messages)
    // The server keyset cursor must never be touched by an in-memory reorder.
    expect(state.nextCursorConversation).toBe("cursor-abc")
    expect(mockFindConversationAuthenticatedAPI).not.toHaveBeenCalled()
  })

  test("bubbleConversationToTop fetches and prepends a conversation that isn't loaded client-side", async () => {
    const store = createChatStore()
    const existing = makeConversation(
      "conv-1",
      new Date("2026-01-01T00:00:00Z"),
    )
    const fetched = makeConversation(
      "conv-new",
      new Date("2026-01-01T02:00:00Z"),
    )
    store.setState({ conversations: [existing] as never })
    mockFindConversationAuthenticatedAPI.mockResolvedValue({ data: fetched })

    await store.getState().bubbleConversationToTop("ws-1", "conv-new")

    expect(mockFindConversationAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "conv-new",
    })
    expect(store.getState().conversations).toEqual([fetched, existing])
  })

  test("bubbleConversationToTop is a silent no-op when the conversation cannot be fetched (e.g. filtered out)", async () => {
    const store = createChatStore()
    const existing = makeConversation(
      "conv-1",
      new Date("2026-01-01T00:00:00Z"),
    )
    store.setState({ conversations: [existing] as never })
    mockFindConversationAuthenticatedAPI.mockRejectedValue(
      new Error("not found"),
    )

    await expect(
      store.getState().bubbleConversationToTop("ws-1", "conv-missing"),
    ).resolves.toBeUndefined()
    expect(store.getState().conversations).toEqual([existing])
    // The failure is logged (not silently swallowed), even
    // though it never surfaces as a toast.
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-missing" }),
      expect.any(String),
    )
  })
})

describe("chat store handleNewMessage read state", () => {
  const AGENT_LAST_READ_AT = new Date("2026-01-01T00:00:00Z")

  const makeUnreadStore = (activeConversationId: string | null = null) => {
    const store = createChatStore()
    const conversation = {
      ...makeConversation("conv-1", new Date("2026-01-01T01:00:00Z")),
      agentLastReadAt: AGENT_LAST_READ_AT,
      adminRepliedAt: null,
    }
    store.setState({
      conversations: [conversation] as never,
      activeConversationId,
    })
    return store
  }

  const readStateOf = (store: ReturnType<typeof createChatStore>) => {
    const conversation = store
      .getState()
      .conversations.find((c) => c.id === "conv-1") as TestConversation
    return {
      agentLastReadAt: conversation.agentLastReadAt,
      adminRepliedAt: conversation.adminRepliedAt,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setConversationUrl(null)
  })

  test.each([
    "bot",
    "system",
  ] as const)("a %s outgoing message leaves the conversation unread", async (senderType) => {
    const store = makeUnreadStore()

    await store
      .getState()
      .handleNewMessage(
        makeOutgoingMessage(
          "conv-1",
          new Date("2026-01-01T02:00:00Z"),
          senderType,
        ) as never,
      )

    expect(readStateOf(store)).toEqual({
      agentLastReadAt: AGENT_LAST_READ_AT,
      adminRepliedAt: null,
    })
  })

  test.each([
    "user",
    "api",
  ] as const)("a %s outgoing message marks the conversation read and replied", async (senderType) => {
    const store = makeUnreadStore()

    await store
      .getState()
      .handleNewMessage(
        makeOutgoingMessage(
          "conv-1",
          new Date("2026-01-01T02:00:00Z"),
          senderType,
        ) as never,
      )

    const { agentLastReadAt, adminRepliedAt } = readStateOf(store)
    expect(agentLastReadAt).not.toEqual(AGENT_LAST_READ_AT)
    expect(agentLastReadAt).toEqual(adminRepliedAt)
  })

  test("a channel echo (senderType user, no senderId) leaves the conversation unread", async () => {
    const store = makeUnreadStore()

    await store
      .getState()
      .handleNewMessage(
        makeOutgoingMessage(
          "conv-1",
          new Date("2026-01-01T02:00:00Z"),
          "user",
          null,
        ) as never,
      )

    expect(readStateOf(store)).toEqual({
      agentLastReadAt: AGENT_LAST_READ_AT,
      adminRepliedAt: null,
    })
  })

  test("an incoming message on the open conversation marks it read without an admin reply", async () => {
    const store = makeUnreadStore("conv-1")

    await store
      .getState()
      .handleNewMessage(
        makeMessage("conv-1", new Date("2026-01-01T02:00:00Z")) as never,
      )

    const { agentLastReadAt, adminRepliedAt } = readStateOf(store)
    expect(agentLastReadAt).not.toEqual(AGENT_LAST_READ_AT)
    expect(adminRepliedAt).toBeNull()
  })

  test("an incoming message on a background conversation stays unread", async () => {
    const store = makeUnreadStore("conv-other")

    await store
      .getState()
      .handleNewMessage(
        makeMessage("conv-1", new Date("2026-01-01T02:00:00Z")) as never,
      )

    expect(readStateOf(store)).toEqual({
      agentLastReadAt: AGENT_LAST_READ_AT,
      adminRepliedAt: null,
    })
  })
})

// A WhatsApp call Meta counts as a contact touch opens the 24h window, so the
// inbox must unlock the reply box the moment its card lands — not only after
// a reload re-reads the column the finalize moved.
describe("chat store handleNewMessage messaging window", () => {
  const PREVIOUS_WINDOW = new Date("2026-09-17T08:00:00Z")
  const CALL_RANG_AT = "2026-09-18T09:55:00.000Z"

  const makeStore = (lastIncomingMessageAt: Date | null) => {
    const store = createChatStore()
    store.setState({
      conversations: [
        {
          ...makeConversation("conv-1", new Date("2026-09-17T08:00:00Z")),
          contactRepliedAt: null,
          contactInboxes: [{ id: "ci-1", lastIncomingMessageAt }],
        },
      ] as never,
    })
    return store
  }

  const conversationOf = (store: ReturnType<typeof createChatStore>) =>
    store
      .getState()
      .conversations.find((c) => c.id === "conv-1") as unknown as {
      contactRepliedAt: Date | null
      contactInboxes: { lastIncomingMessageAt: Date | null }[]
    }

  const makeCallCard = (customerServiceWindowOpenedAt?: string) =>
    ({
      ...makeMessage("conv-1", new Date("2026-09-18T10:00:00Z")),
      id: "msg-call",
      messageType: "activity",
      senderType: "system",
      contentAttributes: {
        type: "whatsapp_call",
        direction: "userInitiated",
        status: "failed",
        ...(customerServiceWindowOpenedAt
          ? { customerServiceWindowOpenedAt }
          : {}),
      },
    }) as never

  beforeEach(() => {
    vi.clearAllMocks()
    setConversationUrl(null)
  })

  test("a call card carrying the stamp opens the window from the stamped moment", async () => {
    const store = makeStore(PREVIOUS_WINDOW)

    await store.getState().handleNewMessage(makeCallCard(CALL_RANG_AT))

    expect(
      conversationOf(store).contactInboxes[0]?.lastIncomingMessageAt,
    ).toEqual(new Date(CALL_RANG_AT))
  })

  test("a call card is not the contact replying — last-seen timestamps stay put", async () => {
    const store = makeStore(PREVIOUS_WINDOW)

    await store.getState().handleNewMessage(makeCallCard(CALL_RANG_AT))

    expect(conversationOf(store).contactRepliedAt).toBeNull()
  })

  test("a call card without the stamp leaves the window alone", async () => {
    const store = makeStore(PREVIOUS_WINDOW)

    await store.getState().handleNewMessage(makeCallCard())

    expect(
      conversationOf(store).contactInboxes[0]?.lastIncomingMessageAt,
    ).toEqual(PREVIOUS_WINDOW)
  })

  test("an older stamp never shrinks a window a newer message already opened", async () => {
    const newer = new Date("2026-09-18T11:00:00Z")
    const store = makeStore(newer)

    await store.getState().handleNewMessage(makeCallCard(CALL_RANG_AT))

    expect(
      conversationOf(store).contactInboxes[0]?.lastIncomingMessageAt,
    ).toEqual(newer)
  })

  test("a contact's message still opens the window and marks them as replied", async () => {
    const store = makeStore(PREVIOUS_WINDOW)
    const sentAt = new Date("2026-09-18T12:00:00Z")

    await store
      .getState()
      .handleNewMessage(makeMessage("conv-1", sentAt) as never)

    const conversation = conversationOf(store)
    expect(conversation.contactInboxes[0]?.lastIncomingMessageAt).toEqual(
      sentAt,
    )
    expect(conversation.contactRepliedAt).toEqual(sentAt)
  })
})

describe("chat store loadMoreMessages", () => {
  test("prepends the older page and advances the message cursor", async () => {
    const store = createChatStore()
    const existing = makeMessage("conv-1", new Date("2026-01-01T02:00:00Z"))
    store.setState({
      activeConversationId: "conv-1",
      messages: [existing] as never,
      nextCursorMessage: "cursor-1",
    })
    const older = makeMessage("conv-1", new Date("2026-01-01T01:00:00Z"))
    const oldest = makeMessage("conv-1", new Date("2026-01-01T00:00:00Z"))
    // The API returns newest-first; the store reverses into display order.
    mockListMessagesAuthenticatedAPI.mockResolvedValue({
      data: [older, oldest],
      nextCursor: null,
    })

    await store.getState().loadMoreMessages("ws-1", 20)

    expect(mockListMessagesAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      perPage: 20,
      cursor: "cursor-1",
      conversationId: "conv-1",
    })
    expect(store.getState().messages).toEqual([oldest, older, existing])
    expect(store.getState().hasNextMessagePage).toBe(false)
    expect(store.getState().isLoadMoreMessage).toBe(false)
    expect(store.getState().messagesConversationId).toBe("conv-1")
  })

  test("resets the in-flight flag when the request fails so a retry is possible", async () => {
    const store = createChatStore()
    store.setState({ activeConversationId: "conv-1" })
    mockListMessagesAuthenticatedAPI.mockRejectedValueOnce(
      new Error("network down"),
    )

    await expect(store.getState().loadMoreMessages("ws-1", 20)).rejects.toThrow(
      "network down",
    )
    expect(store.getState().isLoadMoreMessage).toBe(false)
    expect(store.getState().hasNextMessagePage).toBe(true)

    mockListMessagesAuthenticatedAPI.mockResolvedValueOnce({
      data: [],
      nextCursor: null,
    })
    await store.getState().loadMoreMessages("ws-1", 20)

    expect(mockListMessagesAuthenticatedAPI).toHaveBeenCalledTimes(2)
  })
})

describe("chat store inbox seed state", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("merges the server seed fields into the initial store state", () => {
    const seededMessage = makeMessage(
      "conv-seeded",
      new Date("2026-01-01T00:00:00Z"),
    )
    const seededContact = { id: "contact-seeded" }
    const store = createChatStore({
      conversations: [
        makeConversation("conv-seeded", new Date("2026-01-01T00:00:00Z")),
      ] as never,
      activeConversationId: "conv-seeded",
      activeConversationAutoSelected: true,
      messages: [seededMessage] as never,
      messagesConversationId: "conv-seeded",
      seededContact: seededContact as never,
    })

    expect(store.getState()).toMatchObject({
      activeConversationId: "conv-seeded",
      activeConversationAutoSelected: true,
      messages: [seededMessage],
      messagesConversationId: "conv-seeded",
      seededContact,
    })
  })

  test("loadInitialMessages skips the matching seeded page and fetches a different one", async () => {
    const store = createChatStore({
      activeConversationId: "conv-seeded",
      messagesConversationId: "conv-seeded",
    })

    await store.getState().loadInitialMessages("ws-1", 20)
    expect(mockListMessagesAuthenticatedAPI).not.toHaveBeenCalled()

    mockListMessagesAuthenticatedAPI.mockResolvedValue({
      data: [],
      nextCursor: null,
    })
    store.setState({ messagesConversationId: "conv-other" })

    await store.getState().loadInitialMessages("ws-1", 20)

    expect(mockListMessagesAuthenticatedAPI).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      perPage: 20,
      cursor: "",
      conversationId: "conv-seeded",
    })
  })

  test("clears the seed fields when changing conversations and resetting state", () => {
    const store = createChatStore({
      activeConversationId: "conv-seeded",
      activeConversationAutoSelected: true,
      messagesConversationId: "conv-seeded",
      seededContact: { id: "contact-seeded" } as never,
    })

    store.getState().setActiveConversationId("conv-other")

    expect(store.getState()).toMatchObject({
      activeConversationAutoSelected: false,
      messagesConversationId: null,
      seededContact: null,
    })

    store.setState({
      activeConversationAutoSelected: true,
      messagesConversationId: "conv-other",
      seededContact: { id: "contact-other" } as never,
    })
    store.getState().resetState()

    expect(store.getState()).toMatchObject({
      activeConversationAutoSelected: false,
      messagesConversationId: null,
      seededContact: null,
    })
  })
})
