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

// Same rationale as message-item-send-error.test.tsx.
vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: () => null,
}))

// Same rationale: the real card pulls in the playback store and a live pg Pool.
vi.mock("@/features/messages/components/whatsapp-call-card", () => ({
  WhatsappCallCard: () => null,
}))

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image
    <img alt={alt} height={1} src={src} width={1} />
  ),
}))

let container: HTMLDivElement | null = null
let root: Root | null = null

const tenantSettings = {
  storageUrl: "https://cdn.example.com",
} as unknown as TenantSettings

const renderItem = (message: MessageResourceWithRelations) => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <TenantProvider settings={tenantSettings}>
        <MessageItem message={message} />
      </TenantProvider>,
    )
  })
  return container
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  container = null
  root = null
})

const makeMessage = (overrides: Partial<MessageResourceWithRelations>) =>
  ({
    id: "msg-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    messageType: "incoming",
    type: "message",
    text: "",
    deletedAt: null,
    attributes: null,
    contentAttributes: null,
    attachments: [],
    ...overrides,
  }) as unknown as MessageResourceWithRelations

const paymentMessage = (
  entity: Record<string, unknown>,
): MessageResourceWithRelations =>
  makeMessage({
    text: "RAW-PREVIEW-TEXT",
    contentAttributes: {
      type: "whatsapp_payment_method",
      paymentMethod: "offsite_card_pay",
      raw: {},
      ...entity,
    },
  })

describe("MessageItem one-click payment confirmation", () => {
  test("shows one localized label with the card digits and not the raw preview text", () => {
    const el = renderItem(paymentMessage({ lastFourDigits: "5235" }))

    expect(el.textContent).toContain("confirmedPaymentWithCard")
    expect(el.textContent).not.toContain("RAW-PREVIEW-TEXT")
    expect(el.textContent?.match(/confirmedPayment/g)).toHaveLength(1)
  })

  test("without card digits shows the plain confirmation label", () => {
    const el = renderItem(paymentMessage({}))

    expect(el.textContent).toContain("confirmedPayment")
    expect(el.textContent).not.toContain("confirmedPaymentWithCard")
    expect(el.textContent).not.toContain("RAW-PREVIEW-TEXT")
  })

  test("a plain text message is unaffected", () => {
    const el = renderItem(makeMessage({ text: "Hello there" }))

    expect(el.textContent).toContain("Hello there")
    expect(el.textContent).not.toContain("confirmedPayment")
  })
})
