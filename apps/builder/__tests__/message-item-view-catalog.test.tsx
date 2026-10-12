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
  useLocale: () => "en",
}))

// Same rationale as message-item-send-error.test.tsx: this module imports
// "use server" query modules that drag in a live pg Pool under vitest.
vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: () => null,
}))

// The real card pulls in the playback store and workspace context; no call
// message is rendered here.
vi.mock("@/features/messages/components/whatsapp-call-card", () => ({
  WhatsappCallCard: () => null,
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
    text: "browser",
    deletedAt: null,
    attributes: null,
    contentAttributes: null,
    attachments: [],
    ...overrides,
  }) as unknown as MessageResourceWithRelations

describe("MessageItem view-catalog message", () => {
  test("shows the catalog button and the footer under the message text", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          contentAttributes: { viewCatalog: { footer: "Free shipping" } },
        })}
      />,
    )

    expect(el.textContent).toContain("browser")
    expect(el.textContent).toContain("Free shipping")
    expect(
      el.querySelector('[data-slot="view-catalog-button"]')?.textContent,
    ).toBe("viewCatalog")
  })

  test("shows the button alone when the step has no footer", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          contentAttributes: { viewCatalog: { footer: "" } },
        })}
      />,
    )

    expect(
      el.querySelector('[data-slot="view-catalog-button"]')?.textContent,
    ).toBe("viewCatalog")
    expect(el.querySelector('[data-slot="view-catalog-footer"]')).toBeNull()
  })

  test("the button is only a picture of what the contact sees: it is disabled", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          contentAttributes: { viewCatalog: { footer: "x" } },
        })}
      />,
    )

    const button = el.querySelector<HTMLButtonElement>(
      '[data-slot="view-catalog-button"]',
    )
    expect(button?.disabled).toBe(true)
  })

  test("an ordinary message shows no catalog button", () => {
    const el = renderComponent(<MessageItem message={makeMessage()} />)

    expect(el.querySelector('[data-slot="view-catalog-button"]')).toBeNull()
  })
})
