import { act } from "react"
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

vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ wsUrl: "ws://localhost:1999" }),
}))

const { authSessionMock } = vi.hoisted(() => ({
  authSessionMock: vi.fn(() => ({ data: { user: { id: "user-winner" } } })),
}))
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: authSessionMock },
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    realtimeAPI: {
      mintWorkspaceConnectTokenAuthenticatedAPI: vi
        .fn()
        .mockResolvedValue({ token: "token-1" }),
    },
  },
}))

const bubbleConversationToTopMock = vi.fn().mockResolvedValue(undefined)
const chatStoreState = {
  handleNewMessage: vi.fn(),
  markMessagesDeleted: vi.fn(),
  markMessageFailed: vi.fn(),
  assignMessageCommentId: vi.fn(),
  updateMessageText: vi.fn(),
  updateMessageContentAttributes: vi.fn(),
  updateContact: vi.fn(),
  updateConversations: vi.fn(),
  bubbleConversationToTop: bubbleConversationToTopMock,
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof chatStoreState) => unknown) =>
    selector(chatStoreState),
}))

let capturedOnMessage: ((event: { data: string }) => void) | null = null
vi.mock("partysocket/react", () => ({
  default: (options: { onMessage: (event: { data: string }) => void }) => {
    capturedOnMessage = options.onMessage
    return {}
  },
}))

const { ChatRealtime } = await import("@/features/chat/chat-realtime")

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

function emit(eventType: string, data: unknown) {
  capturedOnMessage?.({ data: JSON.stringify({ eventType, data }) })
}

describe("ChatRealtime — whatsappCallClaimedElsewhere", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    bubbleConversationToTopMock.mockResolvedValue(undefined)
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedOnMessage = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("clears the losing agent's ringing dialog when someone else answers", async () => {
    authSessionMock.mockReturnValue({ data: { user: { id: "user-loser" } } })
    useWhatsappVoipCallStore.setState({ call: baseVoipCall })
    await render()

    act(() => {
      emit("whatsappCallClaimedElsewhere", {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        answeredByUserId: "user-winner",
      })
    })

    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
  })

  test("the winning agent (answeredByUserId matches) ignores its own broadcast", async () => {
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
    useWhatsappVoipCallStore.setState({
      call: { ...baseVoipCall, phase: "answering" },
    })
    await render()

    act(() => {
      emit("whatsappCallClaimedElsewhere", {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        answeredByUserId: "user-winner",
      })
    })

    expect(useWhatsappVoipCallStore.getState().call).not.toBeNull()
  })

  test("ignores the event for a different call", async () => {
    authSessionMock.mockReturnValue({ data: { user: { id: "user-loser" } } })
    useWhatsappVoipCallStore.setState({ call: baseVoipCall })
    await render()

    act(() => {
      emit("whatsappCallClaimedElsewhere", {
        whatsappCallId: "call-other",
        wacid: "wacid-other",
        answeredByUserId: "user-winner",
      })
    })

    expect(useWhatsappVoipCallStore.getState().call).not.toBeNull()
  })

  test("ignores the event once the local call has moved past incomingRinging (e.g. this agent is itself answering)", async () => {
    authSessionMock.mockReturnValue({ data: { user: { id: "user-loser" } } })
    useWhatsappVoipCallStore.setState({
      call: { ...baseVoipCall, phase: "answering" },
    })
    await render()

    act(() => {
      emit("whatsappCallClaimedElsewhere", {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        answeredByUserId: "user-winner",
      })
    })

    expect(useWhatsappVoipCallStore.getState().call).not.toBeNull()
  })
})

describe("ChatRealtime — ring-all basket (multi-ring)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    bubbleConversationToTopMock.mockResolvedValue(undefined)
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedOnMessage = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("two incoming events both land in the basket, not the single call slot", async () => {
    await render()

    act(() => {
      emit("whatsappCallTransportIncoming", {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        contactName: "Ada Lovelace",
        offer: { sdpType: "offer", sdp: "v=0 offer" },
        deadlineAt: new Date(Date.now() + 20_000).toISOString(),
      })
    })
    act(() => {
      emit("whatsappCallTransportIncoming", {
        whatsappCallId: "call-2",
        wacid: "wacid-2",
        conversationId: "conversation-2",
        contactInboxId: "contact-inbox-2",
        contactName: "Grace Hopper",
        offer: { sdpType: "offer", sdp: "v=0 offer" },
        deadlineAt: new Date(Date.now() + 20_000).toISOString(),
      })
    })

    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-1", "call-2"])
    expect(bubbleConversationToTopMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-1",
    )
    expect(bubbleConversationToTopMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-2",
    )
  })

  test("whatsappCallClaimedElsewhere removes only the matching basket entry", async () => {
    useWhatsappVoipCallStore.setState({
      ringingCalls: [
        { ...baseVoipCall, whatsappCallId: "call-1" },
        { ...baseVoipCall, whatsappCallId: "call-2" },
      ],
    })
    await render()

    act(() => {
      emit("whatsappCallClaimedElsewhere", {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        answeredByUserId: "user-someone-else",
      })
    })

    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-2"])
  })

  test("whatsappCallTransportEnded removes only the matching basket entry", async () => {
    useWhatsappVoipCallStore.setState({
      ringingCalls: [
        { ...baseVoipCall, whatsappCallId: "call-1" },
        { ...baseVoipCall, whatsappCallId: "call-2" },
      ],
    })
    await render()

    act(() => {
      emit("whatsappCallTransportEnded", {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        status: "completed",
      })
    })

    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-2"])
  })

  test("whatsappCallTransportEnded for the engaged slot's own call still lingers as ended (handleEnded), independent of the basket", async () => {
    useWhatsappVoipCallStore.setState({
      call: { ...baseVoipCall, phase: "active" },
      ringingCalls: [{ ...baseVoipCall, whatsappCallId: "call-2" }],
    })
    await render()

    act(() => {
      emit("whatsappCallTransportEnded", {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        status: "completed",
      })
    })

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe("ended")
    // The basket is untouched — call-1 was never in it.
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-2"])
  })

  test("claimed-by-self (the winning agent) preserves the promoted slot and does not touch the basket", async () => {
    useWhatsappVoipCallStore.setState({
      call: { ...baseVoipCall, phase: "answering" },
      ringingCalls: [{ ...baseVoipCall, whatsappCallId: "call-2" }],
    })
    await render()

    act(() => {
      emit("whatsappCallClaimedElsewhere", {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        answeredByUserId: "user-winner",
      })
    })

    expect(useWhatsappVoipCallStore.getState().call?.whatsappCallId).toBe(
      "call-1",
    )
    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe("answering")
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-2"])
  })
})

const baseOutboundCall = {
  transport: "voip" as const,
  whatsappCallId: "out-call-1",
  wacid: "out-wacid-1",
  attemptId: "attempt-1",
  phase: "outboundDialing" as const,
  direction: "outbound" as const,
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  deadlineAt: new Date(Date.now() + 60_000).toISOString(),
  isMuted: false,
  isRecording: false,
}

describe("ChatRealtime — outbound VoIP events", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    bubbleConversationToTopMock.mockResolvedValue(undefined)
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [],
      pendingOutboundAnswer: null,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedOnMessage = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("whatsappCallOutboundAnswer sets the pending-answer handoff without logging the SDP", async () => {
    await render()

    act(() => {
      emit("whatsappCallOutboundAnswer", {
        whatsappCallId: "out-call-1",
        wacid: "out-wacid-1",
        attemptId: "attempt-1",
        session: { sdpType: "answer", sdp: "v=0 answer-sdp" },
      })
    })

    expect(useWhatsappVoipCallStore.getState().pendingOutboundAnswer).toEqual({
      whatsappCallId: "out-call-1",
      sdp: "v=0 answer-sdp",
    })
  })

  test("whatsappCallOutboundStatus('ringing') moves an outboundDialing call to outboundRinging", async () => {
    useWhatsappVoipCallStore.setState({ call: baseOutboundCall })
    await render()

    act(() => {
      emit("whatsappCallOutboundStatus", {
        whatsappCallId: "out-call-1",
        wacid: "out-wacid-1",
        attemptId: "attempt-1",
        status: "ringing",
      })
    })

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe(
      "outboundRinging",
    )
  })

  test("whatsappCallOutboundStatus('accepted') moves the call to active", async () => {
    useWhatsappVoipCallStore.setState({
      call: { ...baseOutboundCall, phase: "outboundRinging" },
    })
    await render()

    act(() => {
      emit("whatsappCallOutboundStatus", {
        whatsappCallId: "out-call-1",
        wacid: "out-wacid-1",
        attemptId: "attempt-1",
        status: "accepted",
      })
    })

    expect(useWhatsappVoipCallStore.getState().call?.phase).toBe("active")
  })
})

describe("ChatRealtime — call permission reply invalidates the outbound call mode", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    capturedOnMessage = null
  })

  const render = () =>
    act(() => {
      root.render(<ChatRealtime />)
    })

  test("a customer's accept reply refetches the button's call-mode query for that conversation", async () => {
    await render()

    act(() => {
      emit("messageCreated", {
        id: "message-1",
        conversationId: "conversation-42",
        contentAttributes: {
          type: "whatsapp_call_permission_reply",
          response: "accept",
        },
      })
    })

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

    act(() => {
      emit("messageCreated", {
        id: "message-2",
        conversationId: "conversation-42",
        contentAttributes: { type: "text" },
      })
    })

    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })

  test("a whatsappCallPermissionUpdated event (138017-reconciled grant) refetches the call-mode query for that conversation", async () => {
    // The 138017 path records a permanent grant with no `call_permission_reply`
    // message, so the button must be flipped to direct-dial off this dedicated
    // event instead — see `send-message.ts` and `resolveOutboundCallMode`.
    await render()

    act(() => {
      emit("whatsappCallPermissionUpdated", {
        conversationId: "conversation-42",
      })
    })

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: [
        "whatsapp-outbound-call-mode",
        "workspace-1",
        "conversation-42",
      ],
    })
  })
})
