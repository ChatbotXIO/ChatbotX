import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useWhatsappVoipCallStore } from "@/features/integration-whatsapp/calling/voip/voip-call-store"

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

const { invalidateQueriesMock } = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))

const {
  getOutboundAnswerMock,
  getPendingIncomingMock,
  loggerErrorMock,
  realtimeContext,
} = vi.hoisted(() => ({
  getOutboundAnswerMock: vi.fn(),
  getPendingIncomingMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  realtimeContext: { resyncCount: 0 },
}))
vi.mock("@/features/realtime/workspace-realtime-provider", () => ({
  useWorkspaceRealtimeContext: () => ({
    reconnectCount: 0,
    resyncCount: realtimeContext.resyncCount,
    status: "open",
    subscribeHandlers: vi.fn(),
  }),
}))
vi.mock(
  "@/features/integration-whatsapp/calling/actions/get-pending-incoming-voip-call.action",
  () => ({ getPendingIncomingVoipCallAction: getPendingIncomingMock }),
)
vi.mock(
  "@/features/integration-whatsapp/calling/actions/get-outbound-voip-answer.action",
  () => ({ getOutboundVoipAnswerAction: getOutboundAnswerMock }),
)
vi.mock("@/lib/log", () => ({ logger: { error: loggerErrorMock } }))

const { authSessionMock } = vi.hoisted(() => ({
  authSessionMock: vi.fn(() => ({ data: { user: { id: "user-winner" } } })),
}))
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: authSessionMock },
}))

// This component does NOT depend on ChatStoreProvider — deliberately no
// mock for `@/features/chat/store/chat-store-provider` here, so importing
// it would throw if the component ever reached for it.
let capturedHandlers: Record<string, (event: unknown) => void> | null = null
vi.mock("@/features/realtime/use-workspace-realtime-events", () => ({
  useWorkspaceRealtimeEvents: (
    handlers: Record<string, (event: unknown) => void>,
  ) => {
    capturedHandlers = handlers
  },
}))

const { WhatsappCallRealtime } = await import(
  "@/features/integration-whatsapp/calling/voip/whatsapp-call-realtime"
)

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

describe("WhatsappCallRealtime — call event parity (no ChatStoreProvider)", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
    realtimeContext.resyncCount = 0
    getPendingIncomingMock.mockResolvedValue({
      data: { calls: [], isComplete: true },
    })
    getOutboundAnswerMock.mockResolvedValue({ data: { sdp: null } })
    useWhatsappVoipCallStore.setState({
      call: null,
      dismissedRingIds: [],
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
    capturedHandlers = null
  })

  const render = () =>
    act(() => {
      root.render(<WhatsappCallRealtime />)
    })

  test("registers exactly the seven call/routing events", async () => {
    await render()
    expect(Object.keys(capturedHandlers ?? {}).sort()).toEqual(
      [
        "conversationAssigned",
        "whatsappCallClaimedElsewhere",
        "whatsappCallOutboundAnswer",
        "whatsappCallOutboundStatus",
        "whatsappCallPermissionUpdated",
        "whatsappCallTransportEnded",
        "whatsappCallTransportIncoming",
      ].sort(),
    )
  })

  test("whatsappCallTransportIncoming lands in the basket, not the single call slot", async () => {
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

    expect(useWhatsappVoipCallStore.getState().call).toBeNull()
    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-1"])
  })

  test("two incoming events both land in the basket, in order, not the single call slot", async () => {
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
  })

  test("whatsappCallTransportEnded removes the basket entry and lingers the slot as ended", async () => {
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

  test("whatsappCallOutboundAnswer sets the pending-answer handoff", async () => {
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

  test("whatsappCallPermissionUpdated invalidates the outbound call mode query", async () => {
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

  test("whatsappCallClaimedElsewhere clears the losing agent's ringing dialog", async () => {
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

  test("whatsappCallClaimedElsewhere stops the ring in the winning agent's OTHER tabs", async () => {
    // The same agent with the inbox open in several tabs: every tab rang, one
    // answered. The others share the winner's user id, so a user-based filter
    // would leave them ringing until the deadline - only the phase tells them
    // apart from the tab that actually answered.
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
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

  test("whatsappCallClaimedElsewhere is a no-op for the winning agent's own broadcast", async () => {
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

  test("whatsappCallClaimedElsewhere ignores the event for a different call", async () => {
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

  test("whatsappCallClaimedElsewhere ignores the event once the local call has moved past incomingRinging (e.g. this agent is itself answering)", async () => {
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

  test("claimed-by-self (the winning agent) preserves the promoted slot and does not touch the basket", async () => {
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
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

  test("conversationAssigned drops the ringing basket entry when reassigned to someone else", async () => {
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
    useWhatsappVoipCallStore.setState({
      ringingCalls: [
        {
          ...baseVoipCall,
          whatsappCallId: "call-1",
          conversationId: "conversation-1",
        },
        {
          ...baseVoipCall,
          whatsappCallId: "call-2",
          conversationId: "conversation-2",
        },
      ],
    })
    await render()

    act(() => {
      emit("conversationAssigned", {
        conversationIds: ["conversation-1"],
        assignedUserId: "user-someone-else",
        assignedInboxTeamId: null,
      })
    })

    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-2"])
  })

  test("conversationAssigned keeps the ringing basket entry when reassigned to THIS agent", async () => {
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
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

    act(() => {
      emit("conversationAssigned", {
        conversationIds: ["conversation-1"],
        assignedUserId: "user-winner",
        assignedInboxTeamId: null,
      })
    })

    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-1"])
  })

  test("conversationAssigned keeps the ringing basket entry when the conversation becomes unassigned", async () => {
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
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

    act(() => {
      emit("conversationAssigned", {
        conversationIds: ["conversation-1"],
        assignedUserId: null,
        assignedInboxTeamId: null,
      })
    })

    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-1"])
  })

  test("conversationAssigned ignores an id for a conversation not in the basket", async () => {
    authSessionMock.mockReturnValue({ data: { user: { id: "user-winner" } } })
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

    act(() => {
      emit("conversationAssigned", {
        conversationIds: ["conversation-other"],
        assignedUserId: "user-someone-else",
        assignedInboxTeamId: null,
      })
    })

    expect(
      useWhatsappVoipCallStore
        .getState()
        .ringingCalls.map((entry) => entry.whatsappCallId),
    ).toEqual(["call-1"])
  })
})

describe("WhatsappCallRealtime — ring reload after a resync", () => {
  let container: HTMLDivElement
  let root: Root

  const serverOffer = (id: string) => ({
    whatsappCallId: id,
    wacid: `wacid-${id}`,
    conversationId: `conversation-${id}`,
    contactInboxId: "contact-inbox-1",
    contactName: "Ada Lovelace",
    offer: { sdpType: "offer" as const, sdp: "v=0 offer" },
    deadlineAt: new Date(Date.now() + 40_000).toISOString(),
  })
  const basketIds = () =>
    useWhatsappVoipCallStore
      .getState()
      .ringingCalls.map((entry) => entry.whatsappCallId)
  const settle = () => act(() => Promise.resolve())
  const render = () =>
    act(() => {
      root.render(<WhatsappCallRealtime />)
    })

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    realtimeContext.resyncCount = 0
    getPendingIncomingMock.mockResolvedValue({
      data: { calls: [], isComplete: true },
    })
    getOutboundAnswerMock.mockResolvedValue({ data: { sdp: null } })
    useWhatsappVoipCallStore.setState({
      call: null,
      dismissedRingIds: [],
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
    capturedHandlers = null
  })

  test("does not ask the server before any resync has happened", async () => {
    await render()
    await settle()

    expect(getPendingIncomingMock).not.toHaveBeenCalled()
  })

  test("adds a ring the gateway could not replay once resyncCount bumps", async () => {
    await render()
    getPendingIncomingMock.mockResolvedValue({
      data: { calls: [serverOffer("missed")], isComplete: true },
    })

    realtimeContext.resyncCount = 1
    await render()
    await settle()

    expect(getPendingIncomingMock).toHaveBeenCalledWith("workspace-1")
    expect(basketIds()).toEqual(["missed"])
  })

  test("drops a ring the server says is no longer answerable", async () => {
    await render()
    emit("whatsappCallTransportIncoming", serverOffer("claimed-elsewhere"))
    emit("whatsappCallTransportIncoming", serverOffer("still-ringing"))
    getPendingIncomingMock.mockResolvedValue({
      data: { calls: [serverOffer("still-ringing")], isComplete: true },
    })

    realtimeContext.resyncCount = 1
    await render()
    await settle()

    expect(basketIds()).toEqual(["still-ringing"])
  })

  test("keeps a ring the server did not list when its candidate list was capped", async () => {
    await render()
    emit("whatsappCallTransportIncoming", serverOffer("older-than-the-cap"))
    getPendingIncomingMock.mockResolvedValue({
      data: { calls: [serverOffer("newer")], isComplete: false },
    })

    realtimeContext.resyncCount = 1
    await render()
    await settle()

    expect(basketIds()).toEqual(["older-than-the-cap", "newer"])
  })

  test("keeps a ring that arrived over realtime while the server was being asked", async () => {
    await render()
    const { promise, resolve } = Promise.withResolvers<{
      data: { calls: unknown[]; isComplete: boolean }
    }>()
    getPendingIncomingMock.mockReturnValue(promise)

    realtimeContext.resyncCount = 1
    await render()
    emit("whatsappCallTransportIncoming", serverOffer("arrived-mid-fetch"))
    resolve({ data: { calls: [], isComplete: true } })
    await settle()

    expect(basketIds()).toEqual(["arrived-mid-fetch"])
  })

  test("does not drop any ring when the server action fails", async () => {
    await render()
    emit("whatsappCallTransportIncoming", serverOffer("ringing"))
    getPendingIncomingMock.mockResolvedValue({ serverError: "boom" })

    realtimeContext.resyncCount = 1
    await render()
    await settle()

    expect(basketIds()).toEqual(["ringing"])
  })

  test("logs and keeps the basket when the request rejects", async () => {
    await render()
    emit("whatsappCallTransportIncoming", serverOffer("ringing"))
    const failure = new Error("network down")
    getPendingIncomingMock.mockRejectedValue(failure)

    realtimeContext.resyncCount = 1
    await render()
    await settle()

    expect(basketIds()).toEqual(["ringing"])
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: failure },
      expect.any(String),
    )
  })

  test("asks once per resync, not on every render", async () => {
    realtimeContext.resyncCount = 1
    await render()
    await settle()
    await render()
    await settle()
    expect(getPendingIncomingMock).toHaveBeenCalledTimes(1)

    realtimeContext.resyncCount = 2
    await render()
    await settle()
    expect(getPendingIncomingMock).toHaveBeenCalledTimes(2)
  })
})

describe("WhatsappCallRealtime — outbound answer recovery after a resync", () => {
  let container: HTMLDivElement
  let root: Root

  const pendingAnswer = () =>
    useWhatsappVoipCallStore.getState().pendingOutboundAnswer
  const settle = () => act(() => Promise.resolve())
  const render = () =>
    act(() => {
      root.render(<WhatsappCallRealtime />)
    })
  const resync = async () => {
    realtimeContext.resyncCount += 1
    await render()
    await settle()
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    realtimeContext.resyncCount = 0
    getPendingIncomingMock.mockResolvedValue({
      data: { calls: [], isComplete: true },
    })
    getOutboundAnswerMock.mockResolvedValue({ data: { sdp: "v=0 answer" } })
    useWhatsappVoipCallStore.setState({
      call: null,
      dismissedRingIds: [],
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
    capturedHandlers = null
  })

  test.each([
    "outboundDialing",
    "outboundRinging",
    "active",
  ] as const)("re-fetches the missed answer for an outbound call in %s and hands it to the peer", async (phase) => {
    useWhatsappVoipCallStore.setState({
      call: { ...baseOutboundCall, phase },
    })
    await render()

    await resync()

    expect(getOutboundAnswerMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "out-call-1",
    })
    expect(pendingAnswer()).toEqual({
      whatsappCallId: "out-call-1",
      sdp: "v=0 answer",
    })
  })

  test.each([
    ["no call", null],
    ["an inbound call", baseVoipCall],
    ["a call still preparing", { ...baseOutboundCall, phase: "preparing" }],
    ["a call that already ended", { ...baseOutboundCall, phase: "ended" }],
  ])("does not ask for an answer when there is %s", async (_name, call) => {
    useWhatsappVoipCallStore.setState({
      call: call as typeof baseOutboundCall | null,
    })
    await render()

    await resync()

    expect(getOutboundAnswerMock).not.toHaveBeenCalled()
  })

  test("waits for a call that was still preparing at resync time, then fetches once it has its real id", async () => {
    useWhatsappVoipCallStore.setState({
      call: {
        ...baseOutboundCall,
        phase: "preparing",
        whatsappCallId: "attempt-nonce",
      },
    })
    await render()

    await resync()
    expect(getOutboundAnswerMock).not.toHaveBeenCalled()

    // The initiate action returns: the slot now holds the real call id, and
    // Meta's answer (sent right after initiation) may have been missed.
    act(() => {
      useWhatsappVoipCallStore.setState({ call: baseOutboundCall })
    })
    await settle()

    expect(getOutboundAnswerMock).toHaveBeenCalledTimes(1)
    expect(getOutboundAnswerMock).toHaveBeenCalledWith("workspace-1", {
      whatsappCallId: "out-call-1",
    })
    expect(pendingAnswer()).toEqual({
      whatsappCallId: "out-call-1",
      sdp: "v=0 answer",
    })
  })

  test("does not fetch for a call that starts after a resync that found nothing to recover", async () => {
    await render()
    await resync()

    act(() => {
      useWhatsappVoipCallStore.setState({ call: baseOutboundCall })
    })
    await settle()

    expect(getOutboundAnswerMock).not.toHaveBeenCalled()
  })

  test("does not ask before any resync has happened", async () => {
    useWhatsappVoipCallStore.setState({ call: baseOutboundCall })

    await render()
    await settle()

    expect(getOutboundAnswerMock).not.toHaveBeenCalled()
  })

  test("leaves the handoff empty when the server has no answer to give", async () => {
    getOutboundAnswerMock.mockResolvedValue({ data: { sdp: null } })
    useWhatsappVoipCallStore.setState({ call: baseOutboundCall })
    await render()

    await resync()

    expect(pendingAnswer()).toBeNull()
  })

  test("leaves the handoff empty when the action fails", async () => {
    getOutboundAnswerMock.mockResolvedValue({ serverError: "boom" })
    useWhatsappVoipCallStore.setState({ call: baseOutboundCall })
    await render()

    await resync()

    expect(pendingAnswer()).toBeNull()
  })

  test("logs and leaves the handoff empty when the request rejects", async () => {
    const failure = new Error("network down")
    getOutboundAnswerMock.mockRejectedValue(failure)
    useWhatsappVoipCallStore.setState({ call: baseOutboundCall })
    await render()

    await resync()

    expect(pendingAnswer()).toBeNull()
    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: failure, whatsappCallId: "out-call-1" },
      expect.any(String),
    )
  })

  test("drops the answer when the call ended or was replaced while the request was in flight", async () => {
    const { promise, resolve } = Promise.withResolvers<{
      data: { sdp: string }
    }>()
    getOutboundAnswerMock.mockReturnValue(promise)
    useWhatsappVoipCallStore.setState({ call: baseOutboundCall })
    await render()

    realtimeContext.resyncCount += 1
    await render()
    act(() => {
      useWhatsappVoipCallStore.setState({ call: null })
    })
    resolve({ data: { sdp: "v=0 late answer" } })
    await settle()

    expect(pendingAnswer()).toBeNull()
  })
})
