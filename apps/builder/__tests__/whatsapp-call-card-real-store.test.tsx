import type { MessageWhatsappCallEntity } from "@chatbotx.io/sdk"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * `WhatsappCallCard` selects a fresh object literal from `useChatStore` on
 * every call. Under zustand v5's real `useSyncExternalStore`, a selector
 * result compared by reference triggers an infinite re-render loop — other
 * tests mock `useChatStore` and can't catch this, so this file renders
 * against the real `ChatStoreProvider`.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-outbound-call-mode",
  () => ({
    useOutboundCallMode: () => ({ data: undefined }),
  }),
)

const callStarterMock = {
  voipCallContext: null as unknown,
  isResolvingMode: false,
  isVoipMode: false,
  canDialDirectly: false,
  isDialing: false,
  handleClick: vi.fn(),
  dialogs: null,
}
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-whatsapp-call-starter",
  () => ({
    useWhatsappCallStarter: () => callStarterMock,
  }),
)

vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    useOptionalWhatsappVoipCallContext: () => null,
  }),
)

const { WhatsappCallCard } = await import(
  "@/features/messages/components/whatsapp-call-card"
)
const { ChatStoreProvider } = await import(
  "@/features/chat/store/chat-store-provider"
)

const baseCall: MessageWhatsappCallEntity = {
  type: "whatsapp_call",
  direction: "userInitiated",
  status: "failed",
  durationSeconds: 0,
  answerSeconds: 0,
  hasRecording: false,
  recordingRequested: false,
  transcriptionRequested: false,
  hasTranscript: false,
  hasSummary: false,
  recordingExpired: false,
}

let container: HTMLDivElement | null = null
let root: Root | null = null

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

describe("WhatsappCallCard — real ChatStoreProvider (CRITICAL 1 regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("renders without looping ('Maximum update depth exceeded') under the real store", () => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    expect(() => {
      act(() => {
        root?.render(
          <ChatStoreProvider>
            <WhatsappCallCard call={baseCall} conversationId="conv-1" />
          </ChatStoreProvider>,
        )
      })
    }).not.toThrow()

    expect(container.textContent).toContain("missedVoiceCall")
  })
})
