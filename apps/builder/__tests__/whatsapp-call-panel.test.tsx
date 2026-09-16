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
    useVoipRingtone: (active: boolean) => voipRingtoneMock(active),
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
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
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

  test("R5: a connection-lost ended call shows the translated connection-lost notice", async () => {
    useWhatsappVoipCallStore.setState({ call: connectionLostCall })
    await render()

    expect(document.body.textContent).toContain(
      "whatsapp.calls.panel.statusConnectionLost",
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
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
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
    expect(contextMock.answer).toHaveBeenCalledWith("ring-a")

    act(() => {
      document
        .querySelector(`[aria-label="whatsapp.calls.reject"]`)
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.dismiss).toHaveBeenCalledWith("ring-a")
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
    expect(contextMock.answer).toHaveBeenCalledWith("ring-b")
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
    expect(contextMock.answer).toHaveBeenCalledWith("ring-a")
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

    expect(voipRingtoneMock).toHaveBeenLastCalledWith(true)
  })

  test("ringtone gating: rings for exactly one tone with 2+ basket entries too (never doubled per entry)", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringA, ringB] })
    await render()

    expect(voipRingtoneMock).toHaveBeenLastCalledWith(true)
  })

  test("ringtone gating: stays silent when the basket is empty and nothing is incomingRinging", async () => {
    useWhatsappVoipCallStore.setState({ call: activeCall, ringingCalls: [] })
    await render()

    expect(voipRingtoneMock).toHaveBeenLastCalledWith(false)
  })

  // An outbound dial no longer refuses to start while an offer sits in the
  // basket, so both tone conditions can now be true at the same moment. Each
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
    expect(voipRingtoneMock).toHaveBeenLastCalledWith(false)
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
