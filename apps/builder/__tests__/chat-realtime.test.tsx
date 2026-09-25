import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useWhatsappVoipCallStore } from "@/features/integration-whatsapp/calling/voip/voip-call-store"

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

const { invalidateQueriesMock } = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
}))
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))

const bubbleConversationToTopMock = vi.fn().mockResolvedValue(undefined)
const openConversationMock = vi.fn().mockResolvedValue(true)
const chatStoreState = {
  applyAgentLastReadAt: vi.fn(),
  handleNewMessage: vi.fn(),
  markMessagesDeleted: vi.fn(),
  markMessageFailed: vi.fn(),
  assignMessageCommentId: vi.fn(),
  updateMessageText: vi.fn(),
  updateMessageContentAttributes: vi.fn(),
  updateContact: vi.fn(),
  updateConversations: vi.fn(),
  bubbleConversationToTop: bubbleConversationToTopMock,
  openConversation: openConversationMock,
}
const wholeStoreSelectionMock = vi.fn()
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof chatStoreState) => unknown) => {
    const selection = selector(chatStoreState)
    if (selection === chatStoreState) {
      wholeStoreSelectionMock()
    }
    return selection
  },
}))

const conversationIdParamMock = { set: vi.fn(), clear: vi.fn() }
vi.mock("@/features/conversations/hooks/use-conversation-id-param", () => ({
  useConversationIdParam: () => conversationIdParamMock,
}))

// Captures the handler map `ChatRealtime` passes to `useWorkspaceRealtimeEvents`
// so `emit` can invoke it directly, mirroring what the real provider dispatches.
let capturedHandlers: Record<string, (event: unknown) => void> | null = null
vi.mock("@/features/realtime/use-workspace-realtime-events", () => ({
  useWorkspaceRealtimeEvents: (
    handlers: Record<string, (event: unknown) => void>,
  ) => {
    capturedHandlers = handlers
  },
}))

const { ChatRealtime } = await import("@/features/chat/chat-realtime")

function emit(eventType: string, data: unknown) {
  capturedHandlers?.[eventType]?.({ eventType, data })
}

const baseVoipCall = {
  transport: "voip" as const,
  whatsappCallId: "call-1",
  wacid: "wacid-1",
  direction: "inbound" as const,
  phase: "incomingRinging" as const,
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  offer: { sdpType: "offer" as const, sdp: "v=0 offer" },
  deadlineAt: new Date(Date.now() + 20_000).toISOString(),
  isMuted: false,
  isRecording: false,
}

describe("ChatRealtime — chat event parity", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    bubbleConversationToTopMock.mockResolvedValue(undefined)
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedHandlers = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("subscribes only to stable actions instead of the whole chat store", async () => {
    await render()

    expect(wholeStoreSelectionMock).not.toHaveBeenCalled()
  })

  test("registers exactly the ten chat events, no more, no fewer", async () => {
    await render()
    expect(Object.keys(capturedHandlers ?? {}).sort()).toEqual(
      [
        "contactBlocked",
        "contactUnblocked",
        "conversationAssigned",
        "conversationUpdated",
        "messageContentUpdated",
        "messageCreated",
        "messageDeleted",
        "messageFailed",
        "messageIdAssigned",
        "messageUpdated",
      ].sort(),
    )
  })

  test("messageDeleted marks messages deleted", async () => {
    await render()
    act(() => emit("messageDeleted", { messageIds: ["m1"] }))
    expect(chatStoreState.markMessagesDeleted).toHaveBeenCalledWith(["m1"])
  })

  test("messageIdAssigned assigns the comment id", async () => {
    await render()
    act(() => emit("messageIdAssigned", { messageId: "m1", commentId: "c1" }))
    expect(chatStoreState.assignMessageCommentId).toHaveBeenCalledWith(
      "m1",
      "c1",
    )
  })

  test("messageFailed marks the message failed", async () => {
    await render()
    act(() =>
      emit("messageFailed", {
        messageId: "m1",
        clientId: "client-1",
        error: "boom",
      }),
    )
    expect(chatStoreState.markMessageFailed).toHaveBeenCalledWith(
      "m1",
      "client-1",
      "boom",
    )
  })

  test("messageUpdated updates the message text/attachment fields", async () => {
    await render()
    act(() =>
      emit("messageUpdated", {
        messageId: "m1",
        newText: "hello",
        newAttachmentPath: "p",
        newAttachmentPublicUrl: "u",
        newAttachmentMimeType: "image/png",
        newAttachmentWidth: 10,
        newAttachmentHeight: 20,
        removedAttachment: false,
      }),
    )
    expect(chatStoreState.updateMessageText).toHaveBeenCalledWith(
      "m1",
      "hello",
      {
        newAttachmentPath: "p",
        newAttachmentPublicUrl: "u",
        newAttachmentMimeType: "image/png",
        newAttachmentWidth: 10,
        newAttachmentHeight: 20,
        removedAttachment: false,
      },
    )
  })

  test("messageContentUpdated patches content attributes", async () => {
    await render()
    act(() =>
      emit("messageContentUpdated", {
        messageId: "m1",
        contentAttributes: { foo: "bar" },
      }),
    )
    expect(chatStoreState.updateMessageContentAttributes).toHaveBeenCalledWith(
      "m1",
      { foo: "bar" },
    )
  })

  test("contactBlocked / contactUnblocked update the contact", async () => {
    await render()
    act(() => emit("contactBlocked", { contactId: "c1" }))
    expect(chatStoreState.updateContact).toHaveBeenCalledWith("c1", {
      blockedAt: expect.any(Date),
    })
    act(() => emit("contactUnblocked", { contactId: "c1" }))
    expect(chatStoreState.updateContact).toHaveBeenCalledWith("c1", {
      blockedAt: null,
    })
  })

  test("conversationAssigned updates the conversations", async () => {
    await render()
    act(() =>
      emit("conversationAssigned", {
        conversationIds: ["conv-1"],
        assignedUserId: "user-1",
        assignedInboxTeamId: null,
      }),
    )
    expect(chatStoreState.updateConversations).toHaveBeenCalledWith(
      ["conv-1"],
      {
        assignedUserId: "user-1",
        assignedInboxTeamId: null,
        assignedUser: null,
        assignedInboxTeam: null,
      },
    )
  })

  test("conversationUpdated applies a valid agent read timestamp", async () => {
    await render()
    act(() =>
      emit("conversationUpdated", {
        conversationIds: ["conv-1", "conv-2"],
        changes: { agentLastReadAt: "2026-09-23T10:00:00.000Z" },
      }),
    )

    expect(chatStoreState.applyAgentLastReadAt).toHaveBeenCalledWith(
      ["conv-1", "conv-2"],
      new Date("2026-09-23T10:00:00.000Z"),
    )
  })

  test("conversationUpdated ignores a null agent read timestamp", async () => {
    await render()
    act(() =>
      emit("conversationUpdated", {
        conversationIds: ["conv-1"],
        changes: { agentLastReadAt: null },
      }),
    )

    expect(chatStoreState.applyAgentLastReadAt).not.toHaveBeenCalled()
  })

  test("conversationUpdated ignores a malformed agent read timestamp", async () => {
    await render()
    act(() =>
      emit("conversationUpdated", {
        conversationIds: ["conv-1"],
        changes: { agentLastReadAt: "not-a-date" },
      }),
    )

    expect(chatStoreState.applyAgentLastReadAt).not.toHaveBeenCalled()
  })
})

describe("ChatRealtime — call permission reply invalidates the outbound call mode", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedHandlers = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("a customer's accept reply refetches the button's call-mode query for that conversation", async () => {
    await render()

    const message = {
      id: "message-1",
      conversationId: "conversation-42",
      contentAttributes: {
        type: "whatsapp_call_permission_reply",
        response: "accept",
      },
    }
    act(() => {
      emit("messageCreated", message)
    })

    expect(chatStoreState.handleNewMessage).toHaveBeenCalledWith(message)
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: [
        "whatsapp-outbound-call-mode",
        "workspace-1",
        "conversation-42",
      ],
    })
  })

  test("a plain text message does not invalidate the call-mode query", async () => {
    await render()

    const message = {
      id: "message-2",
      conversationId: "conversation-42",
      contentAttributes: { type: "text" },
    }
    act(() => {
      emit("messageCreated", message)
    })

    expect(chatStoreState.handleNewMessage).toHaveBeenCalledWith(message)
    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })
})

describe("ChatRealtime — bubble-to-top on ringing", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    bubbleConversationToTopMock.mockResolvedValue(undefined)
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedHandlers = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("bubbles a conversation the first time its call appears in the ringing basket", async () => {
    await render()

    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging({
        ...baseVoipCall,
        whatsappCallId: "call-1",
        conversationId: "conversation-1",
      })
    })

    expect(bubbleConversationToTopMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-1",
    )
  })

  test("bubbles a call already ringing at mount time (covers the resume-after-refresh path)", async () => {
    useWhatsappVoipCallStore.setState({
      ringingCalls: [
        {
          ...baseVoipCall,
          whatsappCallId: "call-1",
          conversationId: "conversation-1",
        },
      ],
    })

    await render()

    expect(bubbleConversationToTopMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-1",
    )
  })

  test("never bubbles the same whatsappCallId twice", async () => {
    await render()

    act(() => {
      useWhatsappVoipCallStore.getState().enqueueRinging({
        ...baseVoipCall,
        whatsappCallId: "call-1",
        conversationId: "conversation-1",
      })
    })
    act(() => {
      // A store update that re-references the same whatsappCallId must not re-bubble it.
      useWhatsappVoipCallStore.setState((state) => ({
        ringingCalls: [...state.ringingCalls],
      }))
    })

    expect(bubbleConversationToTopMock).toHaveBeenCalledTimes(1)
  })

  test("under React Strict Mode, a call already ringing at mount is bubbled exactly once, not twice per synthetic remount", () => {
    useWhatsappVoipCallStore.setState({
      ringingCalls: [
        {
          ...baseVoipCall,
          whatsappCallId: "call-1",
          conversationId: "conversation-1",
        },
      ],
    })

    act(() => {
      root.render(
        <StrictMode>
          <ChatRealtime />
        </StrictMode>,
      )
    })

    expect(bubbleConversationToTopMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-1",
    )
    expect(bubbleConversationToTopMock).toHaveBeenCalledTimes(1)
  })
})

describe("ChatRealtime — pendingConversationOpen bridge", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    openConversationMock.mockResolvedValue(true)
    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [],
      pendingConversationOpen: null,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedHandlers = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("opens and clears a pending conversation set before mount", async () => {
    useWhatsappVoipCallStore
      .getState()
      .setPendingConversationOpen("conversation-9")

    await render()

    expect(openConversationMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-9",
    )
    expect(conversationIdParamMock.set).toHaveBeenCalledWith("conversation-9")
    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen,
    ).toBeNull()
  })

  test("opens and clears a pending conversation set after mount", async () => {
    await render()

    await act(async () => {
      useWhatsappVoipCallStore
        .getState()
        .setPendingConversationOpen("conversation-42")
      await Promise.resolve()
    })

    expect(openConversationMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-42",
    )
    expect(conversationIdParamMock.set).toHaveBeenCalledWith("conversation-42")
    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen,
    ).toBeNull()
  })

  // The URL param must never be synced when `openConversation` resolves false
  // (e.g. a concurrent bootstrap landed on a different conversation, or the
  // fetch failed) — otherwise the URL and the real selection disagree.
  test("does NOT sync the URL param when openConversation resolves unsuccessfully", async () => {
    openConversationMock.mockResolvedValue(false)
    useWhatsappVoipCallStore
      .getState()
      .setPendingConversationOpen("conversation-9")

    await render()
    await act(async () => {
      await Promise.resolve()
    })

    expect(openConversationMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-9",
    )
    expect(conversationIdParamMock.set).not.toHaveBeenCalled()
  })

  test("does nothing while pendingConversationOpen stays null", async () => {
    await render()

    expect(openConversationMock).not.toHaveBeenCalled()
    expect(conversationIdParamMock.set).not.toHaveBeenCalled()
  })

  test("C: a stale pending request (set long before the inbox mounted) is dropped, not reopened", async () => {
    useWhatsappVoipCallStore.setState({
      pendingConversationOpen: {
        conversationId: "conversation-stale",
        requestedAt: Date.now() - 60_000,
      },
    })

    await render()

    expect(openConversationMock).not.toHaveBeenCalled()
    expect(conversationIdParamMock.set).not.toHaveBeenCalled()
    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen,
    ).toBeNull()
  })
})
