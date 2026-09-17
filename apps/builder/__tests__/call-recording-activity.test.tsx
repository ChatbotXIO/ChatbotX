import type { MessageWhatsappCallRecordingEntity } from "@chatbotx.io/sdk"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { AttachmentResource } from "@/features/attachments/schema/resource"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

vi.mock("@/features/attachments/utils", () => ({
  useAttachmentUrl: (attachment: AttachmentResource | undefined) =>
    attachment?.url ?? undefined,
}))

const { getCallRecordingUrlActionMock } = vi.hoisted(() => ({
  getCallRecordingUrlActionMock: vi.fn(),
}))

vi.mock("@/features/messages/actions/get-call-recording-url.action", () => ({
  getCallRecordingUrlAction: getCallRecordingUrlActionMock,
}))

const { CallRecordingActivity } = await import(
  "@/features/messages/components/call-recording-activity"
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

const attachment = {
  id: "att-1",
  fileType: "audio",
  mimeType: "audio/ogg",
  url: "https://signed.example/initial",
  originPath: "space/ws-1/calls/call-1.ogg",
  name: null,
} as unknown as AttachmentResource

const recording: MessageWhatsappCallRecordingEntity = {
  type: "whatsapp_call_recording",
  callId: "call-1",
}

describe("CallRecordingActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCallRecordingUrlActionMock.mockResolvedValue({
      data: { url: "https://signed.example/refreshed" },
    })
  })

  test("renders nothing when there is no attachment", () => {
    const el = renderComponent(
      <CallRecordingActivity attachment={undefined} recording={recording} />,
    )
    expect(el.querySelector("audio")).toBeNull()
  })

  test("renders the audio player with the initial attachment URL", () => {
    const el = renderComponent(
      <CallRecordingActivity attachment={attachment} recording={recording} />,
    )
    const audio = el.querySelector("audio")
    expect(audio).not.toBeNull()
    expect(audio?.getAttribute("src")).toBe("https://signed.example/initial")
  })

  test("hides the transcript block when no transcript is present", () => {
    const el = renderComponent(
      <CallRecordingActivity attachment={attachment} recording={recording} />,
    )
    expect(el.textContent).not.toContain("showTranscript")
  })

  test("shows a collapsible transcript trigger when a transcript is present", () => {
    const el = renderComponent(
      <CallRecordingActivity
        attachment={attachment}
        recording={{ ...recording, transcript: "hello from the call" }}
      />,
    )
    expect(el.textContent).toContain("recordingActivity.showTranscript")
    expect(el.textContent).not.toContain("hello from the call")
  })

  test("expands the transcript text on trigger click", () => {
    const el = renderComponent(
      <CallRecordingActivity
        attachment={attachment}
        recording={{ ...recording, transcript: "hello from the call" }}
      />,
    )
    const trigger = el.querySelector('[data-slot="collapsible-trigger"]')
    expect(trigger).not.toBeNull()
    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(el.textContent).toContain("hello from the call")
    expect(el.textContent).toContain("recordingActivity.hideTranscript")
  })

  test("play does NOT trigger a URL refetch — swapping src mid-playback would abort it", async () => {
    const el = renderComponent(
      <CallRecordingActivity attachment={attachment} recording={recording} />,
    )
    const audio = el.querySelector("audio") as HTMLAudioElement

    await act(async () => {
      audio.dispatchEvent(new Event("play"))
      await Promise.resolve()
    })

    expect(getCallRecordingUrlActionMock).not.toHaveBeenCalled()
    expect(audio.getAttribute("src")).toBe("https://signed.example/initial")
  })

  test("error triggers exactly one refetch that updates src", async () => {
    const el = renderComponent(
      <CallRecordingActivity attachment={attachment} recording={recording} />,
    )
    const audio = el.querySelector("audio") as HTMLAudioElement

    await act(async () => {
      audio.dispatchEvent(new Event("error"))
      await Promise.resolve()
    })

    expect(getCallRecordingUrlActionMock).toHaveBeenCalledTimes(1)
    expect(getCallRecordingUrlActionMock).toHaveBeenCalledWith("ws-1", {
      whatsappCallId: "call-1",
    })
    expect(audio.getAttribute("src")).toBe("https://signed.example/refreshed")
  })

  test("a failed refresh does not throw and leaves the player usable", async () => {
    getCallRecordingUrlActionMock.mockRejectedValueOnce(new Error("boom"))
    const el = renderComponent(
      <CallRecordingActivity attachment={attachment} recording={recording} />,
    )
    const audio = el.querySelector("audio") as HTMLAudioElement

    await act(async () => {
      audio.dispatchEvent(new Event("error"))
      await Promise.resolve()
    })

    expect(el.querySelector("audio")).not.toBeNull()
  })
})
