// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

const {
  getCallTranscriptActionMock,
  getCallSummaryActionMock,
  getCallRecordingUrlActionMock,
  listCallSummaryProvidersActionMock,
} = vi.hoisted(() => ({
  getCallTranscriptActionMock: vi.fn(),
  getCallSummaryActionMock: vi.fn(),
  getCallRecordingUrlActionMock: vi.fn(),
  listCallSummaryProvidersActionMock: vi.fn(),
}))

vi.mock("@/features/messages/actions/get-call-transcript.action", () => ({
  getCallTranscriptAction: getCallTranscriptActionMock,
}))
vi.mock("@/features/messages/actions/get-call-summary.action", () => ({
  getCallSummaryAction: getCallSummaryActionMock,
}))
vi.mock("@/features/messages/actions/get-call-recording-url.action", () => ({
  getCallRecordingUrlAction: getCallRecordingUrlActionMock,
}))
vi.mock(
  "@/features/messages/actions/list-call-summary-providers.action",
  () => ({
    listCallSummaryProvidersAction: listCallSummaryProvidersActionMock,
  }),
)
vi.mock("@/features/messages/actions/generate-call-ai-summary.action", () => ({
  generateCallAiSummaryAction: Object.assign(vi.fn(), {
    bind: () => vi.fn(),
  }),
}))

const { WhatsappCallInfoSheet } = await import(
  "@/features/messages/components/whatsapp-call-info-sheet"
)
const { useCallInfoSheetStore } = await import(
  "@/features/messages/store/call-info-sheet-store"
)
const { useCallPlaybackStore } = await import(
  "@/features/messages/store/call-playback-store"
)

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderSheet() {
  const queryClient = new QueryClient({
    // Default retries would delay an errored query well past this test
    // file's `flush()` window before `isError` ever flips to true.
    defaultOptions: { queries: { retry: false } },
  })
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <WhatsappCallInfoSheet />
      </QueryClientProvider>,
    )
  })
}

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
})

const speakerTranscript = {
  segments: [
    { speaker: "Business", start: 0, end: 2, text: "Hello, how can I help?" },
    {
      speaker: "Customer",
      start: 2,
      end: 5,
      text: "I have a billing question.",
    },
  ],
  speakerNames: { business: "Agent Smith", customer: "Ada Lovelace" },
  hasSpeakers: true,
}

describe("WhatsappCallInfoSheet", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    useCallInfoSheetStore.setState({
      isOpen: false,
      whatsappCallId: null,
      tab: "transcript",
    })
    useCallPlaybackStore.setState({
      callId: null,
      status: "idle",
      currentTime: 0,
      duration: 0,
      volume: 1,
    })
    getCallTranscriptActionMock.mockResolvedValue({ data: speakerTranscript })
    getCallSummaryActionMock.mockResolvedValue({ data: { result: undefined } })
    listCallSummaryProvidersActionMock.mockResolvedValue({
      data: { providers: [] },
    })
    getCallRecordingUrlActionMock.mockResolvedValue({
      data: { url: "https://signed.example/audio.ogg" },
    })
  })

  test("renders nothing when the store is closed", async () => {
    renderSheet()
    await flush()
    expect(document.body.textContent).not.toContain("transcriptTab")
  })

  test("opens on the transcript tab when the store says so", async () => {
    act(() => {
      useCallInfoSheetStore.getState().open({
        whatsappCallId: "call-1",
        tab: "transcript",
      })
    })
    renderSheet()
    await flush()

    expect(getCallTranscriptActionMock).toHaveBeenCalledWith("ws-1", {
      whatsappCallId: "call-1",
    })
    expect(document.body.textContent).toContain("Hello, how can I help?")
    expect(document.body.textContent).toContain("Agent Smith")
    expect(document.body.textContent).toContain("Ada Lovelace")
  })

  test("opens on the summary tab when the store says so", async () => {
    act(() => {
      useCallInfoSheetStore.getState().open({
        whatsappCallId: "call-1",
        tab: "summary",
      })
    })
    renderSheet()
    await flush()

    // The summary tab's empty state renders its own "generateSummary" copy,
    // proving the AI Summary panel (not the transcript panel) is active.
    expect(document.body.textContent).toContain("generateSummary")
  })

  test("search filters the transcript segments", async () => {
    act(() => {
      useCallInfoSheetStore.getState().open({
        whatsappCallId: "call-1",
        tab: "transcript",
      })
    })
    renderSheet()
    await flush()

    const search = document.body.querySelector(
      "input[type=text], input:not([type])",
    ) as HTMLInputElement
    expect(search).not.toBeNull()

    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set
    act(() => {
      nativeValueSetter?.call(search, "billing")
      search.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await flush()

    expect(document.body.textContent).toContain("I have a billing question.")
    expect(document.body.textContent).not.toContain("Hello, how can I help?")
  })

  test("clicking a segment seeks the shared playback store to its start time", async () => {
    act(() => {
      useCallInfoSheetStore.getState().open({
        whatsappCallId: "call-1",
        tab: "transcript",
      })
    })
    renderSheet()
    await flush()

    const rows = Array.from(document.body.querySelectorAll("button")).filter(
      (button) => button.textContent?.includes("billing question"),
    )
    expect(rows).toHaveLength(1)

    await act(async () => {
      rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(useCallPlaybackStore.getState().currentTime).toBe(2)
  })

  test("empty segments render the transcript-unavailable state", async () => {
    getCallTranscriptActionMock.mockResolvedValue({
      data: {
        segments: [],
        speakerNames: { business: "", customer: "" },
        hasSpeakers: false,
      },
    })
    act(() => {
      useCallInfoSheetStore.getState().open({
        whatsappCallId: "call-1",
        tab: "transcript",
      })
    })
    renderSheet()
    await flush()

    expect(document.body.textContent).toContain("transcriptUnavailable")
  })

  test("a transcript query error renders a retry state, not the language-unavailable copy", async () => {
    getCallTranscriptActionMock.mockRejectedValue(new Error("network down"))
    act(() => {
      useCallInfoSheetStore.getState().open({
        whatsappCallId: "call-1",
        tab: "transcript",
      })
    })
    renderSheet()
    await flush()

    expect(document.body.textContent).toContain("transcriptError")
    expect(document.body.textContent).not.toContain("transcriptUnavailable")

    const retryButton = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("retry"))
    expect(retryButton).toBeDefined()

    getCallTranscriptActionMock.mockResolvedValue({ data: speakerTranscript })
    act(() => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    await flush()

    expect(document.body.textContent).toContain("Hello, how can I help?")
  })
})
