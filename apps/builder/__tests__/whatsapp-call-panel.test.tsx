import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  useWhatsappVoipCallStore,
  WhatsappVoipCallPhase,
} from "@/features/integration-whatsapp/calling/voip/voip-call-store"
import { WhatsappCallPanel } from "@/features/integration-whatsapp/calling/voip/whatsapp-call-panel"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

const routerPushMock = vi.fn()
let mockPathname = "/space/workspace-1/inbox"
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
  usePathname: () => mockPathname,
}))

const contextMock = {
  answer: vi.fn(),
  dismiss: vi.fn(),
  hangup: vi.fn(),
  toggleMute: vi.fn(),
  dismissEnded: vi.fn(),
  startOutbound: vi.fn(),
}
vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    useWhatsappVoipCallContext: () => contextMock,
  }),
)

const voipRingtoneMock = vi.fn()
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-voip-ringtone",
  () => ({
    useVoipRingtone: (active: boolean, mode?: string, restartKey?: number) =>
      voipRingtoneMock(active, mode, restartKey),
    voipRingtoneModes: { ring: "ring", callWaiting: "callWaiting" },
  }),
)

const voipRingbackMock = vi.fn()
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-voip-ringback",
  () => ({
    useVoipRingback: (active: boolean) => voipRingbackMock(active),
  }),
)

const preparingCall = {
  transport: "voip" as const,
  whatsappCallId: "nonce-1",
  wacid: "",
  phase: WhatsappVoipCallPhase.preparing,
  direction: "outbound" as const,
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  attemptId: "nonce-1",
  deadlineAt: new Date().toISOString(),
  isMuted: false,
  isRecording: false,
}

const incomingCall = {
  transport: "voip" as const,
  whatsappCallId: "call-1",
  wacid: "wacid-1",
  phase: WhatsappVoipCallPhase.incomingRinging,
  direction: "inbound" as const,
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  offer: { sdpType: "offer" as const, sdp: "v=0" },
  deadlineAt: new Date(Date.now() + 30_000).toISOString(),
  isMuted: false,
  isRecording: false,
}

const activeCall = {
  transport: "voip" as const,
  whatsappCallId: "call-1",
  wacid: "wacid-1",
  phase: WhatsappVoipCallPhase.active,
  direction: "inbound" as const,
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  deadlineAt: new Date().toISOString(),
  isMuted: false,
  isRecording: true,
  startedAt: Date.now(),
}

const endedCall = {
  ...activeCall,
  phase: WhatsappVoipCallPhase.ended,
  endedStatus: "rejected" as const,
}

const connectionLostCall = {
  ...activeCall,
  phase: WhatsappVoipCallPhase.ended,
  endedStatus: "connectionLost" as const,
}

const outboundNoAnswerCall = {
  transport: "voip" as const,
  whatsappCallId: "out-call-1",
  wacid: "out-wacid-1",
  phase: WhatsappVoipCallPhase.ended,
  direction: "outbound" as const,
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  attemptId: "attempt-1",
  deadlineAt: new Date().toISOString(),
  isMuted: false,
  isRecording: false,
  endedStatus: "completed" as const,
  // never reached active — no startedAt.
}

const outboundEndedWithDurationCall = {
  ...outboundNoAnswerCall,
  startedAt: Date.now() - 12_000,
}

describe("WhatsappCallPanel", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    contextMock.answer.mockReset()
    mockPathname = "/space/workspace-1/inbox"
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
  })

  const render = () =>
    act(() => {
      root.render(<WhatsappCallPanel />)
    })

  test("renders nothing when there is no call", async () => {
    await render()
    expect(document.body.textContent).toBe("")
  })

  test("preparing phase renders a round End button and no Answer/Reject", async () => {
    useWhatsappVoipCallStore.setState({ call: preparingCall })
    await render()

    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.end"]`),
    ).not.toBeNull()
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).toBeNull()
  })

  test("clicking End during preparing calls hangup()", async () => {
    useWhatsappVoipCallStore.setState({ call: preparingCall })
    await render()

    const endButton = document.querySelector(
      `[aria-label="whatsapp.calls.panel.end"]`,
    )
    act(() => {
      endButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(contextMock.hangup).toHaveBeenCalledTimes(1)
  })

  test("incoming ringing renders Answer + Reject and a countdown, with a backdrop", async () => {
    useWhatsappVoipCallStore.setState({ call: incomingCall })
    await render()

    expect(
      document.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).not.toBeNull()
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.reject"]`),
    ).not.toBeNull()
    expect(document.body.textContent).toContain("ringingCountdown")
  })

  test("clicking Answer calls answer(), clicking Reject calls dismiss()", async () => {
    useWhatsappVoipCallStore.setState({ call: incomingCall })
    await render()

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.answer"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.answer).toHaveBeenCalledTimes(1)

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.reject"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.dismiss).toHaveBeenCalledTimes(1)
  })

  test("a SUCCESSFUL answer while already on the inbox sets the pending-open bridge instead of navigating", async () => {
    mockPathname = "/space/workspace-1/inbox"
    useWhatsappVoipCallStore.setState({ call: incomingCall })
    contextMock.answer.mockImplementation((_id, onAnswered) => {
      onAnswered?.("conversation-1")
      return Promise.resolve("answered")
    })
    await render()

    await act(async () => {
      document
        .querySelector(`[aria-label="whatsapp.calls.answer"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen
        ?.conversationId,
    ).toBe("conversation-1")
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  test("a SUCCESSFUL answer while off the inbox pushes the inbox route with the conversationId", async () => {
    mockPathname = "/space/workspace-1/settings"
    useWhatsappVoipCallStore.setState({ call: incomingCall })
    contextMock.answer.mockImplementation((_id, onAnswered) => {
      onAnswered?.("conversation-1")
      return Promise.resolve("answered")
    })
    await render()

    await act(async () => {
      document
        .querySelector(`[aria-label="whatsapp.calls.answer"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(routerPushMock).toHaveBeenCalledWith(
      "/space/workspace-1/inbox?conversationId=conversation-1",
    )
    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen,
    ).toBeNull()
  })

  test("a FAILED answer (call never becomes active) does not navigate — on the inbox", async () => {
    mockPathname = "/space/workspace-1/inbox"
    useWhatsappVoipCallStore.setState({ call: incomingCall })
    contextMock.answer.mockImplementation(() => Promise.resolve("declined"))
    await render()

    await act(async () => {
      document
        .querySelector(`[aria-label="whatsapp.calls.answer"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen,
    ).toBeNull()
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  test("a FAILED answer (call never becomes active) does not navigate — off the inbox", async () => {
    mockPathname = "/space/workspace-1/settings"
    useWhatsappVoipCallStore.setState({ call: incomingCall })
    contextMock.answer.mockImplementation(() => Promise.resolve("declined"))
    await render()

    await act(async () => {
      document
        .querySelector(`[aria-label="whatsapp.calls.answer"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(routerPushMock).not.toHaveBeenCalled()
  })

  test("active phase renders a live timer, mute, end, and the recording indicator", async () => {
    useWhatsappVoipCallStore.setState({ call: activeCall })
    await render()

    expect(
      document.querySelector(`[aria-label="whatsapp.calls.card.mute"]`),
    ).not.toBeNull()
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.end"]`),
    ).not.toBeNull()
    expect(document.body.textContent).toContain(
      "whatsapp.calls.recordingInProgress",
    )
  })

  test("clicking End while active calls hangup(), clicking Mute calls toggleMute()", async () => {
    useWhatsappVoipCallStore.setState({ call: activeCall })
    await render()

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.card.mute"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.toggleMute).toHaveBeenCalledTimes(1)

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.panel.end"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.hangup).toHaveBeenCalledTimes(1)
  })

  test("Go to conversation: sets the pending-open bridge while already on the inbox", async () => {
    mockPathname = "/space/workspace-1/inbox"
    useWhatsappVoipCallStore.setState({ call: activeCall })
    await render()

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.panel.goToConversation"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(
      useWhatsappVoipCallStore.getState().pendingConversationOpen
        ?.conversationId,
    ).toBe("conversation-1")
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  test("Go to conversation: pushes the inbox route with the conversationId while off the inbox", async () => {
    mockPathname = "/space/workspace-1/settings"
    useWhatsappVoipCallStore.setState({ call: activeCall })
    await render()

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.panel.goToConversation"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(routerPushMock).toHaveBeenCalledWith(
      "/space/workspace-1/inbox?conversationId=conversation-1",
    )
  })

  test("ended phase shows the mapped message and a dismiss control, no Answer/End", async () => {
    useWhatsappVoipCallStore.setState({ call: endedCall })
    await render()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.panel.statusDeclined",
    )
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.end"]`),
    ).toBeNull()
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).toBeNull()
  })

  test("a connection-lost ended call shows the translated connection-lost notice", async () => {
    useWhatsappVoipCallStore.setState({ call: connectionLostCall })
    await render()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.panel.statusConnectionLost",
    )
  })

  test.each([
    ["cannotAnswer", "whatsapp.calls.errors.voipCannotAnswer"],
    ["callEnded", "whatsapp.calls.errors.voipCallEnded"],
    ["micPermissionDenied", "whatsapp.calls.outbound.micPermissionDenied"],
    ["micNotFound", "whatsapp.calls.outbound.micNotFound"],
    ["answerFailed", "whatsapp.calls.panel.answerFailed"],
  ] as const)("a %s answer failure shows its own sentence", async (endedStatus, key) => {
    useWhatsappVoipCallStore.setState({
      call: { ...connectionLostCall, endedStatus },
    })
    await render()

    expect(document.body.textContent).toContain(key)
  })

  test("the server's own reason replaces the status sentence", async () => {
    useWhatsappVoipCallStore.setState({
      call: {
        ...connectionLostCall,
        endedStatus: "answerFailed",
        endedMessage: "This call was answered by another agent",
      },
    })
    await render()

    expect(document.body.textContent).toContain(
      "This call was answered by another agent",
    )
    expect(document.body.textContent).not.toContain(
      "whatsapp.calls.panel.answerFailed",
    )
  })

  test("clicking dismiss on the ended message calls dismissEnded()", async () => {
    useWhatsappVoipCallStore.setState({ call: endedCall })
    await render()

    const dismissButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("whatsapp.calls.panel.dismiss"),
    )
    act(() => {
      dismissButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(contextMock.dismissEnded).toHaveBeenCalledTimes(1)
  })

  test("minimize collapses the panel to a small pill; clicking it re-expands the same panel", async () => {
    useWhatsappVoipCallStore.setState({ call: activeCall })
    await render()

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.panel.minimize"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.end"]`),
    ).toBeNull()
    const pill = document.querySelector(
      `[aria-label="whatsapp.calls.panel.expand"]`,
    )
    expect(pill).not.toBeNull()

    act(() => {
      pill?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.end"]`),
    ).not.toBeNull()
  })

  test("an incoming ring always renders full even if the panel was left minimized from a previous call", async () => {
    useWhatsappVoipCallStore.setState({ call: activeCall })
    await render()

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.panel.minimize"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.expand"]`),
    ).not.toBeNull()

    // A DIFFERENT call (a fresh inbound ring) takes the slot.
    act(() => {
      useWhatsappVoipCallStore.setState({ call: incomingCall })
    })
    await render()

    expect(
      document.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).not.toBeNull()
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.expand"]`),
    ).toBeNull()
  })

  test("isMinimized resets when a different call takes the slot even outside incomingRinging", async () => {
    useWhatsappVoipCallStore.setState({ call: activeCall })
    await render()

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.panel.minimize"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.expand"]`),
    ).not.toBeNull()

    act(() => {
      useWhatsappVoipCallStore.setState({
        call: { ...activeCall, whatsappCallId: "call-2" },
      })
    })
    await render()

    // Fresh call id -> re-expanded, showing the full active panel again.
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.end"]`),
    ).not.toBeNull()
  })

  test("an outbound call that never connected shows 'No answer' with no duration", async () => {
    useWhatsappVoipCallStore.setState({ call: outboundNoAnswerCall })
    await render()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.panel.statusNoAnswer",
    )
    expect(document.body.textContent).not.toContain("·")
  })

  test("an outbound call that connected then ended shows 'Call ended · mm:ss'", async () => {
    useWhatsappVoipCallStore.setState({ call: outboundEndedWithDurationCall })
    await render()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.panel.statusCallEnded",
    )
    expect(document.body.textContent).toContain("·")
    expect(document.body.textContent).not.toContain(
      "whatsapp.calls.panel.statusNoAnswer",
    )
  })

  test("the eyebrow reads CALL ENDED (not ON CALL) for any ended phase", async () => {
    useWhatsappVoipCallStore.setState({ call: endedCall })
    await render()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.panel.eyebrowCallEnded",
    )
    expect(document.body.textContent).not.toContain(
      "whatsapp.calls.panel.eyebrowOnCall",
    )
  })
})

const ringA = {
  whatsappCallId: "ring-a",
  wacid: "wacid-a",
  conversationId: "conversation-a",
  contactInboxId: "contact-inbox-a",
  contactName: "Ada Lovelace",
  offer: { sdpType: "offer" as const, sdp: "v=0" },
  deadlineAt: new Date(Date.now() + 30_000).toISOString(),
}
const ringB = {
  ...ringA,
  whatsappCallId: "ring-b",
  conversationId: "conversation-b",
  contactName: "Grace Hopper",
}

describe("WhatsappCallPanel — basket / multi-ring", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    contextMock.answer.mockReset()
    mockPathname = "/space/workspace-1/inbox"
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
  })

  const render = () =>
    act(() => {
      root.render(<WhatsappCallPanel />)
    })

  test("free slot + exactly one basket entry: the big card fed from the basket entry, with a backdrop", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA] })
    await render()

    expect(document.body.textContent).toContain("Ada Lovelace")
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).not.toBeNull()
    expect(
      document.querySelector('[aria-hidden="true"].fixed.inset-0'),
    ).not.toBeNull()
  })

  test("clicking Answer/Reject on the single basket card targets that entry's id", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA] })
    await render()

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.answer"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.answer).toHaveBeenCalledWith(
      "ring-a",
      expect.any(Function),
    )

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.reject"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.dismiss).toHaveBeenCalledWith("ring-a")
  })

  test("answering the single basket card navigates to its own conversation, off the inbox, only on success", async () => {
    mockPathname = "/space/workspace-1/settings"
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA] })
    contextMock.answer.mockImplementation((_id, onAnswered) => {
      onAnswered?.("conversation-a")
      return Promise.resolve("answered")
    })
    await render()

    await act(async () => {
      document
        .querySelector(`[aria-label="whatsapp.calls.answer"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(routerPushMock).toHaveBeenCalledWith(
      "/space/workspace-1/inbox?conversationId=conversation-a",
    )
  })

  test("does not navigate when answering the single basket card fails", async () => {
    mockPathname = "/space/workspace-1/settings"
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA] })
    // Left ringing (or dismissed) — never promoted to an active call.
    contextMock.answer.mockResolvedValue("declined")
    await render()

    await act(async () => {
      document
        .querySelector(`[aria-label="whatsapp.calls.answer"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    expect(routerPushMock).not.toHaveBeenCalled()
  })

  test("free slot + 2 basket entries: the compact list, one row per caller, with a backdrop", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA, ringB] })
    await render()

    expect(document.body.textContent).toContain("Ada Lovelace")
    expect(document.body.textContent).toContain("Grace Hopper")
    expect(document.body.textContent).toContain("ringingListTitle")
    expect(
      document.querySelectorAll('[aria-label^="whatsapp.calls.answerCaller"]'),
    ).toHaveLength(2)
    expect(
      document.querySelector('[aria-hidden="true"].fixed.inset-0'),
    ).not.toBeNull()
  })

  test("the list's Answer/Reject buttons target their own row's id", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA, ringB] })
    await render()

    const answerButtons = Array.from(
      document.querySelectorAll('[aria-label^="whatsapp.calls.answerCaller"]'),
    )
    act(() => {
      answerButtons[1]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })
    expect(contextMock.answer).toHaveBeenCalledWith(
      "ring-b",
      expect.any(Function),
    )
  })

  test("answering a ring-list row navigates to that row's own conversation, off the inbox, only on success", async () => {
    mockPathname = "/space/workspace-1/settings"
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA, ringB] })
    contextMock.answer.mockImplementation((_id, onAnswered) => {
      onAnswered?.("conversation-b")
      return Promise.resolve("answered")
    })
    await render()

    const answerButtons = Array.from(
      document.querySelectorAll('[aria-label^="whatsapp.calls.answerCaller"]'),
    )
    await act(async () => {
      answerButtons[1]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
      await Promise.resolve()
    })

    expect(routerPushMock).toHaveBeenCalledWith(
      "/space/workspace-1/inbox?conversationId=conversation-b",
    )
  })

  test("engaged slot + ringing basket: the slot's panel keeps its position with NO backdrop, and the ring list stacks above it", async () => {
    useWhatsappVoipCallStore.setState({
      call: activeCall,
      ringingCalls: [ringA],
    })
    await render()

    // The active call panel itself still renders (mute/end controls).
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.card.mute"]`),
    ).not.toBeNull()
    // The ring list is present too...
    expect(document.body.textContent).toContain("Ada Lovelace")
    // ...but no backdrop while the agent is engaged in a call.
    expect(
      document.querySelector('[aria-hidden="true"].fixed.inset-0'),
    ).toBeNull()
  })

  test("engaged slot + ringing basket: the ring row's Answer button routes through context.answer with its own id", async () => {
    useWhatsappVoipCallStore.setState({
      call: activeCall,
      ringingCalls: [ringA],
    })
    await render()

    const answerButton = document.querySelector(
      `[data-testid="whatsapp-ringing-calls-list"] [aria-label^="whatsapp.calls.answerCaller"]`,
    )
    act(() => {
      answerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.answer).toHaveBeenCalledWith(
      "ring-a",
      expect.any(Function),
    )
  })

  test("today's unchanged behavior when the basket is empty: no call renders nothing, a single call renders the normal panel", async () => {
    await render()
    expect(document.body.textContent).toBe("")

    act(() => {
      useWhatsappVoipCallStore.setState({ call: incomingCall })
    })
    await render()
    expect(
      document.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).not.toBeNull()
  })

  test("ringtone gating: rings while ANY basket entry is ringing, even with the slot free and no call object", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA] })
    await render()

    expect(voipRingtoneMock).toHaveBeenLastCalledWith(
      true,
      expect.anything(),
      expect.anything(),
    )
  })

  test("ringtone gating: rings for exactly one tone with 2+ basket entries too (never doubled per entry)", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA, ringB] })
    await render()

    expect(voipRingtoneMock).toHaveBeenLastCalledWith(
      true,
      expect.anything(),
      expect.anything(),
    )
  })

  test("ringtone gating: stays silent when the basket is empty and nothing is incomingRinging", async () => {
    useWhatsappVoipCallStore.setState({ call: activeCall, ringingCalls: [] })
    await render()

    expect(voipRingtoneMock).toHaveBeenLastCalledWith(
      false,
      expect.anything(),
      expect.anything(),
    )
  })

  // An outbound dial starts even while an offer sits in the basket, so both
  // tone conditions can be true at the same moment. Each
  // hook opens its own AudioContext at the same 440/480 Hz pair, so running
  // both would play audibly doubled tones — the dial the agent just clicked
  // deliberately wins over an unanswered offer.
  test("tone gating: an outbound dial silences the incoming ringtone rather than layering both tones", async () => {
    useWhatsappVoipCallStore.setState({
      call: {
        ...preparingCall,
        whatsappCallId: "out-dial-1",
        phase: WhatsappVoipCallPhase.outboundDialing,
      },
      ringingCalls: [ringA],
    })
    await render()

    expect(voipRingbackMock).toHaveBeenLastCalledWith(true)
    expect(voipRingtoneMock).toHaveBeenLastCalledWith(
      false,
      expect.anything(),
      expect.anything(),
    )
  })

  // Ring-all rings the agent who is already mid-conversation too. A full
  // repeating phone ring in their ear for the offer's whole deadline would
  // make the call they are ON impossible to hold, so they get the short
  // call-waiting beep instead — what every real phone system does.
  test("an agent mid-conversation hears the call-waiting beep, not the full ring", async () => {
    useWhatsappVoipCallStore.setState({
      call: activeCall,
      ringingCalls: [ringA],
    })
    await render()

    expect(voipRingtoneMock).toHaveBeenLastCalledWith(
      true,
      "callWaiting",
      expect.anything(),
    )
  })

  test("an agent with a free slot still hears the full ring", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA] })
    await render()

    expect(voipRingtoneMock).toHaveBeenLastCalledWith(
      true,
      "ring",
      expect.anything(),
    )
  })

  // The full ring already repeats on its own. Varying its re-arm key would
  // tear down and rebuild the AudioContext on every new offer, audibly
  // restarting a ring that should play straight through.
  test("a second offer does not re-arm — and so does not restart — the full ring", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA] })
    await render()
    const afterFirst = voipRingtoneMock.mock.calls.at(-1)

    act(() => {
      useWhatsappVoipCallStore.setState({ ringingCalls: [ringA, ringB] })
    })
    const afterSecond = voipRingtoneMock.mock.calls.at(-1)

    expect(afterSecond?.[1]).toBe("ring")
    expect(afterSecond?.[2]).toBe(afterFirst?.[2])
  })

  // Minimizing is a display preference for the call the agent is ON; it must
  // never hide an offer. The ringtone keeps playing while minimized, so
  // dropping the list here would leave an audible ring with nowhere on screen
  // to answer it.
  test("a MINIMIZED engaged call still shows the ring list, so an audible ring is never unanswerable", async () => {
    useWhatsappVoipCallStore.setState({
      call: activeCall,
      ringingCalls: [ringA],
    })
    await render()

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.panel.minimize"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(
      document.querySelector(`[aria-label="whatsapp.calls.panel.expand"]`),
    ).not.toBeNull()
    expect(
      document.querySelector('[data-testid="whatsapp-ringing-calls-list"]'),
    ).not.toBeNull()
  })
})
