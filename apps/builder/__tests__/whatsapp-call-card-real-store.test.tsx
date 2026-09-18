import type { MessageWhatsappCallEntity } from "@chatbotx.io/sdk"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * CRITICAL 1 (P4 review): `WhatsappCallCard` used to select
 * `{ activeConversationContactName, whatsappContactInboxId,
 * resolvedConversationId }` — a FRESH object literal on every call — from
 * `useChatStore`. Every other `WhatsappCallCard` test mocks `useChatStore`
 * itself (a plain function call, `selector(state)`), which can never
 * reproduce this: zustand v5's REAL `useChatStore` goes through
 * `useSyncExternalStore`, which re-invokes the selector on every store
 * notification and compares the result by reference — a fresh literal each
 * time fails that check, re-triggers a notification, and loops forever
 * ("Maximum update depth exceeded"). This file renders the card inside the
 * REAL `ChatStoreProvider` (no `useChatStore` mock) specifically to catch a
 * regression here.
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
