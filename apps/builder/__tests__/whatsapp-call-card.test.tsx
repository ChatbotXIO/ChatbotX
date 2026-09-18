import type { MessageWhatsappCallEntity } from "@chatbotx.io/sdk"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

type MockConversation = {
  id: string
  contact: { fullName: string } | null
  contactInboxes: { id: string; channel: string }[]
}

/** Mutable so call-back tests can seed a conversation with a WhatsApp
 * `contactInboxes` entry — every other (pre-existing) test leaves this at
 * its default empty state. */
const chatStoreState: {
  conversations: MockConversation[]
  activeConversationId: string | null
} = { conversations: [], activeConversationId: null }

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof chatStoreState) => unknown) =>
    selector(chatStoreState),
}))

const { getCallRecordingUrlActionMock } = vi.hoisted(() => ({
  getCallRecordingUrlActionMock: vi.fn(),
}))

vi.mock("@/features/messages/actions/get-call-recording-url.action", () => ({
  getCallRecordingUrlAction: getCallRecordingUrlActionMock,
}))

// P4 item 3 — the call-back control's own hooks are exercised by
// `use-whatsapp-call-starter.test.ts` and `whatsapp-voip-call-button.test.tsx`;
// here they are mocked so `WhatsappCallCard` tests stay focused on
// VISIBILITY/DISABLED logic, not the dial flow itself.
const outboundCallModeMock = { data: undefined as unknown }
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-outbound-call-mode",
  () => ({
    useOutboundCallMode: () => outboundCallModeMock,
  }),
)

const callStarterMock = {
  voipCallContext: {} as unknown,
  isResolvingMode: false,
  isVoipMode: true,
  canDialDirectly: true,
  isDialing: false,
  handleClick: vi.fn(),
  dialogs: null,
}
const useWhatsappCallStarterMock = vi.fn((_params: unknown) => callStarterMock)
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-whatsapp-call-starter",
  () => ({
    useWhatsappCallStarter: (params: unknown) =>
      useWhatsappCallStarterMock(params),
  }),
)

// `WhatsappCallBackButton` reads this directly (to gate the mode query, and
// to decide whether it renders at all) — mocked in sync with
// `callStarterMock.voipCallContext` so these VISIBILITY/DISABLED-focused
// tests don't have to pull in the real `use-whatsapp-voip-call.ts` (which
// transitively touches server-only env vars).
vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    useOptionalWhatsappVoipCallContext: () => callStarterMock.voipCallContext,
  }),
)

const { WhatsappCallCard, CALL_BACK_STATUSES_BY_DIRECTION } = await import(
  "@/features/messages/components/whatsapp-call-card"
)
const { useWhatsappVoipCallStore } = await import(
  "@/features/integration-whatsapp/calling/voip/voip-call-store"
)
const { useCallInfoSheetStore } = await import(
  "@/features/messages/store/call-info-sheet-store"
)

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderComponent(ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

const baseCall: MessageWhatsappCallEntity = {
  type: "whatsapp_call",
  direction: "userInitiated",
  status: "completed",
  durationSeconds: 12,
  answerSeconds: 15,
  callId: "call-1",
  hasRecording: true,
  recordingRequested: true,
  transcriptionRequested: false,
  hasTranscript: false,
  hasSummary: false,
  recordingExpired: false,
}

describe("WhatsappCallCard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCallRecordingUrlActionMock.mockResolvedValue({
      data: { url: "https://signed.example/audio.ogg" },
    })
    useCallInfoSheetStore.setState({
      isOpen: false,
      whatsappCallId: null,
      tab: "transcript",
    })
    chatStoreState.conversations = []
    chatStoreState.activeConversationId = null
    outboundCallModeMock.data = undefined
    callStarterMock.voipCallContext = {}
    callStarterMock.isResolvingMode = false
    callStarterMock.isDialing = false
    callStarterMock.handleClick = vi.fn()
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
  })

  test("a failed inbound call renders as missed", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          status: "failed",
          direction: "userInitiated",
        }}
      />,
    )
    expect(el.textContent).toContain("missedVoiceCall")
    expect(el.querySelector("button")).toBeNull()
  })

  test("a failed inbound call WITH an agentName still renders the answeredBy audit line alongside the outcome row", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          status: "failed",
          direction: "userInitiated",
          agentUserId: "user-1",
          agentName: "Agent Smith",
        }}
      />,
    )
    expect(el.textContent).toContain("missedVoiceCall")
    expect(el.textContent).toContain("answeredBy")
  })

  test("a failed call with NO agentName renders no agent line (never answered)", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          status: "failed",
          direction: "userInitiated",
        }}
      />,
    )
    expect(el.textContent).toContain("missedVoiceCall")
    expect(el.textContent).not.toContain("answeredBy")
    expect(el.textContent).not.toContain("calledBy")
  })

  test("a failed outbound call renders as 'no answer', never 'missed'", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          status: "failed",
          direction: "businessInitiated",
        }}
      />,
    )
    expect(el.textContent).toContain("unansweredVoiceCall")
    expect(el.textContent).not.toContain("missedVoiceCall")
    expect(el.querySelector("button")).toBeNull()
  })

  test("an agent-cancelled outbound call renders as 'cancelled', never 'no answer'", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          status: "canceled",
          direction: "businessInitiated",
        }}
      />,
    )
    expect(el.textContent).toContain("canceledVoiceCall")
    expect(el.textContent).not.toContain("unansweredVoiceCall")
    expect(el.querySelector("button")).toBeNull()
  })

  test("declined call renders no player and no action buttons", () => {
    const el = renderComponent(
      <WhatsappCallCard call={{ ...baseCall, status: "rejected" }} />,
    )
    expect(el.textContent).toContain("declinedVoiceCall")
    expect(el.querySelector("button")).toBeNull()
  })

  test("header shows the answer wait (ring time) in human units, while the player shows talk duration", () => {
    const el = renderComponent(<WhatsappCallCard call={baseCall} />)
    expect(el.textContent).toContain("audioCall")
    // Header sub-label = answerSeconds (15 → "15s"), NOT the m:ss talk time.
    expect(el.textContent).toContain("15s")
    // Player total = durationSeconds (talk time, 12 → 0:12).
    expect(el.textContent).toContain("0:00 / 0:12")
  })

  test("header renders a multi-minute answer wait as '1m 30s', not raw seconds", () => {
    const el = renderComponent(
      <WhatsappCallCard call={{ ...baseCall, answerSeconds: 90 }} />,
    )
    expect(el.textContent).toContain("1m 30s")
    expect(el.textContent).not.toContain("90s")
  })

  test("header omits the sub-label when answerSeconds is unknown", () => {
    const { answerSeconds: _omit, ...withoutAnswer } = baseCall
    const el = renderComponent(<WhatsappCallCard call={withoutAnswer} />)
    expect(el.textContent).toContain("audioCall")
    // Never falls back to any duration in the header.
    expect(el.textContent).not.toContain("15s")
  })

  test("recordingExpired shows the unavailable message instead of the player", () => {
    const el = renderComponent(
      <WhatsappCallCard call={{ ...baseCall, recordingExpired: true }} />,
    )
    expect(el.textContent).toContain("recordingUnavailable")
  })

  test("says the recording is unavailable when none is coming, without waiting out the grace window", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, hasRecording: false, recordingUnavailable: true }}
        callEndedAt={new Date()}
      />,
    )

    expect(el.textContent).toContain("recordingNotCaptured")
    expect(el.textContent).not.toContain("recordingProcessing")
    expect(el.querySelector('button[aria-label="play"]')).toBeNull()
  })

  test("shows a processing placeholder instead of the player before hasRecording is true", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, hasRecording: false }}
        callEndedAt={new Date()}
      />,
    )
    expect(el.textContent).toContain("recordingProcessing")
    expect(el.querySelector('button[aria-label="play"]')).toBeNull()
  })

  test("stops showing 'processing' once the grace window after the call has passed", () => {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000)
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, hasRecording: false }}
        callEndedAt={twentyMinutesAgo}
      />,
    )
    // A recording that never arrived must not leave the card stuck.
    expect(el.textContent).not.toContain("recordingProcessing")
    expect(el.querySelector('button[aria-label="play"]')).toBeNull()
    expect(el.textContent).toContain("audioCall")
  })

  test("shows no player row (and no endless 'processing') when recording was never requested", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, hasRecording: false, recordingRequested: false }}
      />,
    )
    // A call with recording off never gets one — the placeholder that can
    // never resolve must not render.
    expect(el.textContent).not.toContain("recordingProcessing")
    expect(el.querySelector('button[aria-label="play"]')).toBeNull()
    // The call header itself still renders.
    expect(el.textContent).toContain("audioCall")
  })

  test("renders the player once hasRecording is true", () => {
    const el = renderComponent(
      <WhatsappCallCard call={{ ...baseCall, hasRecording: true }} />,
    )
    expect(el.querySelector('button[aria-label="play"]')).not.toBeNull()
    expect(el.textContent).not.toContain("recordingProcessing")
  })

  test("transcript button is still shown (disabled) even when transcription was never requested", () => {
    // Matches the reference UI: both Transcript and AI Summary are always
    // visible; Transcript is merely disabled (with a tooltip) when there is
    // no transcript, rather than hidden.
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          transcriptionRequested: false,
          hasTranscript: false,
        }}
      />,
    )
    expect(el.textContent).toContain("transcript")
    expect(el.querySelector("button:disabled")).not.toBeNull()
  })

  test("transcript button renders disabled until hasTranscript is true", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          transcriptionRequested: true,
          hasTranscript: false,
        }}
      />,
    )
    const buttons = Array.from(el.querySelectorAll("button"))
    const transcriptButton = buttons.find((button) =>
      button.textContent?.includes("transcript"),
    )
    expect(transcriptButton).toBeDefined()
    expect(transcriptButton?.disabled).toBe(true)
  })

  test("AI summary button stays disabled when there is no transcript, even if a summary somehow exists", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, hasSummary: true, hasTranscript: false }}
      />,
    )
    const buttons = Array.from(el.querySelectorAll("button"))
    const summaryButton = buttons.find((button) =>
      button.textContent?.includes("aiSummary"),
    )
    expect(summaryButton).toBeDefined()
    expect(summaryButton?.disabled).toBe(true)
  })

  test("AI summary button is enabled as soon as a transcript exists — the summary itself is generated on demand from the sheet", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, hasTranscript: true, hasSummary: false }}
      />,
    )
    const buttons = Array.from(el.querySelectorAll("button"))
    const summaryButton = buttons.find((button) =>
      button.textContent?.includes("aiSummary"),
    )
    expect(summaryButton).toBeDefined()
    expect(summaryButton?.disabled).toBe(false)

    act(() => {
      summaryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(useCallInfoSheetStore.getState()).toMatchObject({
      isOpen: true,
      whatsappCallId: "call-1",
      tab: "summary",
    })
  })

  test("enabled transcript button opens the sheet with the transcript tab", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          transcriptionRequested: true,
          hasTranscript: true,
        }}
      />,
    )
    const buttons = Array.from(el.querySelectorAll("button"))
    const transcriptButton = buttons.find((button) =>
      button.textContent?.includes("transcript"),
    )

    act(() => {
      transcriptButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })

    expect(useCallInfoSheetStore.getState()).toMatchObject({
      isOpen: true,
      whatsappCallId: "call-1",
      tab: "transcript",
    })
  })

  test("shows the contact name when provided", () => {
    const el = renderComponent(
      <WhatsappCallCard call={baseCall} contactName="Jane Doe" />,
    )
    expect(el.textContent).toContain("Jane Doe")
  })

  test("userInitiated + agentName renders the answeredBy copy (an inbound call is genuinely answered)", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          direction: "userInitiated",
          agentUserId: "user-1",
          agentName: "Agent Smith",
        }}
      />,
    )
    expect(el.textContent).toContain("answeredBy")
    expect(el.textContent).not.toContain("calledBy")
  })

  test("businessInitiated + agentName renders the calledBy copy — answeredByUserId is the INITIATOR there, not an answerer", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          direction: "businessInitiated",
          agentUserId: "user-2",
          agentName: "Agent Outbound",
        }}
      />,
    )
    expect(el.textContent).toContain("calledBy")
    expect(el.textContent).not.toContain("answeredBy")
  })

  test("no agentName renders no agent line at all", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          direction: "userInitiated",
          agentUserId: "user-1",
        }}
      />,
    )
    expect(el.textContent).not.toContain("answeredBy")
    expect(el.textContent).not.toContain("calledBy")
  })

  test("a completed call with failureReason keeps the audio-call layout and renders no badge — it lives beside the message", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          failureReason:
            "138021:WhatsApp client terminated the call due to not receiving any media for a long time.",
        }}
      />,
    )
    // Still the normal completed "Audio call" layout. The failure badge is
    // deliberately NOT here: it renders beside the message, in the same slot an
    // outgoing message's sendError badge uses, so every failed item in the
    // thread carries its icon in the same place (see message-item.tsx).
    expect(el.textContent).toContain("audioCall")
    expect(el.querySelector(".text-destructive")).toBeNull()
  })

  test("a non-completed call with failureReason renders no badge either — same reason", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          status: "failed",
          direction: "userInitiated",
          failureReason: "138021:Media connection dropped",
        }}
      />,
    )
    expect(el.textContent).toContain("missedVoiceCall")
    // Same as above — the badge lives outside the card.
    expect(el.querySelector(".text-destructive")).toBeNull()
  })

  test("no failureReason renders no error affordance", () => {
    const el = renderComponent(<WhatsappCallCard call={baseCall} />)
    expect(el.querySelector(".text-destructive")).toBeNull()
  })

  test("clicking play lazily requests a signed URL via getCallRecordingUrlAction", async () => {
    const el = renderComponent(<WhatsappCallCard call={baseCall} />)
    const playButton = el.querySelector('button[aria-label="play"]')
    expect(playButton).not.toBeNull()

    await act(async () => {
      playButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getCallRecordingUrlActionMock).toHaveBeenCalledWith("ws-1", {
      whatsappCallId: "call-1",
    })
  })

  test("Download triggers a real download instead of opening the recording inline", async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {
        // jsdom does not implement anchor clicks; only the call matters here.
      })

    const el = renderComponent(<WhatsappCallCard call={baseCall} />)
    const moreOptionsButton = el.querySelector(
      'button[aria-label="moreOptions"]',
    )
    expect(moreOptionsButton).not.toBeNull()

    act(() => {
      moreOptionsButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })

    const downloadItem = Array.from(
      document.body.querySelectorAll('[role="menuitem"]'),
    ).find((item) => item.textContent?.includes("download"))
    expect(downloadItem).toBeDefined()

    await act(async () => {
      downloadItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getCallRecordingUrlActionMock).toHaveBeenCalledWith("ws-1", {
      whatsappCallId: "call-1",
    })
    expect(clickSpy).toHaveBeenCalled()
    const createdLink = clickSpy.mock.instances.at(-1) as HTMLAnchorElement
    expect(createdLink.href).toBe("https://signed.example/audio.ogg")
    expect(createdLink.getAttribute("download")).toBe("")

    clickSpy.mockRestore()
  })
})

describe("WhatsappCallCard — Call back (P4 item 3)", () => {
  const conversationWithWhatsapp = (id: string): MockConversation => ({
    id,
    contact: { fullName: "Ada Lovelace" },
    contactInboxes: [{ id: `contact-inbox-${id}`, channel: "whatsapp" }],
  })

  const findCallBackButton = (root: HTMLElement) =>
    Array.from(root.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("callBack"),
    )

  beforeEach(() => {
    vi.clearAllMocks()
    chatStoreState.conversations = [conversationWithWhatsapp("conv-1")]
    chatStoreState.activeConversationId = null
    outboundCallModeMock.data = undefined
    callStarterMock.voipCallContext = {}
    callStarterMock.isResolvingMode = false
    callStarterMock.isDialing = false
    callStarterMock.handleClick = vi.fn()
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
  })

  test("CALL_BACK_STATUSES_BY_DIRECTION matches the plan exactly", () => {
    expect([...CALL_BACK_STATUSES_BY_DIRECTION.userInitiated].sort()).toEqual(
      ["failed", "rejected"].sort(),
    )
    expect([...CALL_BACK_STATUSES_BY_DIRECTION.businessInitiated]).toEqual([])
  })

  test("visible for a userInitiated failed call", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "failed", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)).toBeDefined()
  })

  test("visible for a userInitiated rejected call", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "rejected", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)).toBeDefined()
  })

  test("hidden for a userInitiated canceled call (not a call-back-eligible status)", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "canceled", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)).toBeUndefined()
  })

  test("hidden for a businessInitiated failed call (outbound never offers call-back)", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          status: "failed",
          direction: "businessInitiated",
        }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)).toBeUndefined()
  })

  test("hidden for a businessInitiated canceled call", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{
          ...baseCall,
          status: "canceled",
          direction: "businessInitiated",
        }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)).toBeUndefined()
  })

  test("hidden when calling is disabled for this workspace/member (no voip context)", () => {
    callStarterMock.voipCallContext = null
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "failed", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)).toBeUndefined()
  })

  test("hidden when the conversation has no WhatsApp contactInbox to dial", () => {
    chatStoreState.conversations = [
      { id: "conv-1", contact: null, contactInboxes: [] },
    ]
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "failed", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)).toBeUndefined()
  })

  test("disabled while the agent's call slot is occupied", () => {
    useWhatsappVoipCallStore.setState({ call: { phase: "active" } as never })
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "failed", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)?.disabled).toBe(true)
  })

  test("disabled while the ringing basket is non-empty", () => {
    useWhatsappVoipCallStore.setState({
      call: null,
      ringingCalls: [{ whatsappCallId: "ring-1" } as never],
    })
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "failed", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)?.disabled).toBe(true)
  })

  test("enabled when the call slot AND the ringing basket are both empty", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "failed", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)?.disabled).toBe(false)
  })

  test("clicking Call back routes through the shared starter's handleClick", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "failed", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    act(() => {
      findCallBackButton(el)?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      )
    })
    expect(callStarterMock.handleClick).toHaveBeenCalledTimes(1)
  })

  // LOW 11: a completed call never offers a call-back — `WhatsappCallCard`
  // only reaches the non-completed branch (where `WhatsappCallBackButton`
  // lives) when `call.status !== "completed"`; a completed call renders the
  // full player card instead, with no call-back control at all.
  test("completed calls never render a call-back control, regardless of direction", () => {
    const el = renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "completed", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(findCallBackButton(el)).toBeUndefined()
  })

  // LOW 11: the call-back control's dial target must be the SPECIFIC
  // WhatsApp `contactInboxId` resolved from this message's own conversation
  // (see the P4 review log's deviation note), not left undefined/omitted.
  test("forwards the resolved WhatsApp contactInboxId to the shared starter (and on to startOutbound)", () => {
    renderComponent(
      <WhatsappCallCard
        call={{ ...baseCall, status: "failed", direction: "userInitiated" }}
        conversationId="conv-1"
      />,
    )
    expect(useWhatsappCallStarterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        contactInboxId: "contact-inbox-conv-1",
      }),
    )
  })
})
