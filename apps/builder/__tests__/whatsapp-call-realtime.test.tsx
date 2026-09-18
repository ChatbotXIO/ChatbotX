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
