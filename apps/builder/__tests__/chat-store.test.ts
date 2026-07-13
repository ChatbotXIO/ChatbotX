import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindConversationAuthenticatedAPI, mockKyPost } = vi.hoisted(() => ({
  mockFindConversationAuthenticatedAPI: vi.fn(),
  mockKyPost: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    conversationsAPI: {
      findConversationAuthenticatedAPI: mockFindConversationAuthenticatedAPI,
    },
  },
}))

vi.mock("ky", () => ({
  default: {
    post: mockKyPost,
  },
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
  agentLastReadAt?: Date
}

type TestMessage = {
  id: string
  workspaceId: string
  conversationId: string
  createdAt: Date
  messageType: string
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
  mockKyPost.mockReturnValue({
    json: vi.fn().mockResolvedValue({
      data: conversations,
      nextCursor,
    }),
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
    mockKyPost.mockReturnValue({
      json: vi.fn().mockReturnValue(pageResponse),
    })

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
    mockKyPost.mockReturnValue({
      json: vi.fn().mockRejectedValue(new Error("list failed")),
    })
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
    mockKyPost.mockReturnValue({
      json: vi.fn().mockReturnValue(pageResponse),
    })

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
})
