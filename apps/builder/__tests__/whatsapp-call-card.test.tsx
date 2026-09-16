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

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (
    selector: (state: {
      conversations: unknown[]
      activeConversationId: string | null
    }) => unknown,
  ) => selector({ conversations: [], activeConversationId: null }),
}))

const { getCallRecordingUrlActionMock } = vi.hoisted(() => ({
  getCallRecordingUrlActionMock: vi.fn(),
}))

vi.mock("@/features/messages/actions/get-call-recording-url.action", () => ({
  getCallRecordingUrlAction: getCallRecordingUrlActionMock,
}))

const { WhatsappCallCard } = await import(
  "@/features/messages/components/whatsapp-call-card"
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
