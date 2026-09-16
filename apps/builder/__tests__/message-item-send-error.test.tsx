import type { TenantSettings } from "@chatbotx.io/business"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { MessageItem } from "@/features/messages/components/message-item"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"
import { TenantProvider } from "@/features/tenant/tenant-settings-provider"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// Same rationale as message-item-avatar.test.tsx: MediaLibraryTrigger imports
// "use server" query modules at module scope that drag in a live pg Pool
// under vitest. Stubbing it keeps this test about the send-error affordance.
vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: () => null,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

const tenantSettings = {
  storageUrl: "https://cdn.example.com",
} as unknown as TenantSettings

function renderComponent(ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <TenantProvider settings={tenantSettings}>{ui}</TenantProvider>,
    )
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

const makeMessage = (overrides: Partial<MessageResourceWithRelations> = {}) =>
  ({
    id: "msg-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    messageType: "outgoing",
    type: "message",
    text: "Hello",
    deletedAt: null,
    attributes: null,
    contentAttributes: null,
    attachments: [],
    ...overrides,
  }) as unknown as MessageResourceWithRelations

describe("MessageItem outgoing send-error affordance", () => {
  // Regression guard for extracting the icon/tooltip into MessageErrorBadge —
  // the outgoing-message error icon must render identically to before the
  // extraction (see MessageErrorBadge and whatsapp-call-card's reuse of it).
  test("an outgoing message with sendError renders the destructive error icon", () => {
    const el = renderComponent(
      <MessageItem message={makeMessage({ sendError: "Timed out" })} />,
    )

    expect(el.querySelector(".text-destructive")).not.toBeNull()
  })

  test("an outgoing message with no sendError renders no error icon", () => {
    const el = renderComponent(<MessageItem message={makeMessage()} />)

    expect(el.querySelector(".text-destructive")).toBeNull()
  })

  test("an incoming message is never treated as a send failure even if sendError were set", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          messageType: "incoming",
          sendError: "Timed out",
        })}
      />,
    )

    expect(el.querySelector(".text-destructive")).toBeNull()
  })
})
