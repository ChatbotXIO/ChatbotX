import type { TenantSettings } from "@chatbotx.io/business"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { MessageItem } from "@/features/messages/components/message-item"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"
import { TenantProvider } from "@/features/tenant/tenant-settings-provider"

/**
 * Echoes the key back, plus any interpolated values, so assertions never
 * depend on the English copy yet still see what reached the label.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(",")})` : key,
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
  test("states the card confirmation is not a charge, and hides the raw preview text", () => {
    const el = renderItem(
      paymentMessage({
        lastFourDigits: "5235",
        credentialId: "cred_secret_999",
        referenceId: "order-77",
        paymentTimestamp: 1_726_170_122,
      }),
    )

    expect(el.textContent).toContain("cardTitle")
    expect(el.textContent).toContain("cardEnding(5235)")
    expect(el.textContent).toContain("notCharged")
    expect(el.textContent).toContain("reference(order-77)")
    expect(el.textContent).not.toContain("cred_secret_999")
    expect(el.textContent).not.toContain("RAW-PREVIEW-TEXT")
  })

  test.each([
    1e300,
    Number.MAX_SAFE_INTEGER,
  ])("an out-of-range timestamp (%s) is left out instead of breaking the message", (paymentTimestamp) => {
    const el = renderItem(
      paymentMessage({ referenceId: "order-77", paymentTimestamp }),
    )

    expect(el.textContent).toContain("notCharged")
    expect(el.textContent).toContain("reference(order-77)")
    expect(el.textContent).not.toContain("·")
  })

  test("a non-card confirmation uses the generic title and no card line", () => {
    const el = renderItem(paymentMessage({ paymentMethod: "unknown" }))

    expect(el.textContent).toContain("title")
    expect(el.textContent).not.toContain("cardTitle")
    expect(el.textContent).not.toContain("cardEnding")
    expect(el.textContent).toContain("notCharged")
  })

  test("a plain text message is unaffected", () => {
    const el = renderItem(makeMessage({ text: "Hello there" }))

    expect(el.textContent).toContain("Hello there")
    expect(el.textContent).not.toContain("notCharged")
  })
})

const PIX_CODE = "00020126580014br.gov.bcb.pix0136123e4567"

const paymentRequestMessage = (paymentRequest: Record<string, unknown>) =>
  makeMessage({
    messageType: "outgoing",
    text: "Template: pagamento_pix_teste",
    contentAttributes: {
      type: "whatsapp_template",
      payload: {},
      template: {
        id: "t-1",
        name: "pagamento_pix_teste",
        language: "pt_BR",
        params: {
          button: [
            {
              text: "",
              index: 0,
              sub_type: "payment_request",
              payment_request: paymentRequest,
            },
          ],
        },
      },
    },
  })

describe("MessageItem sent payment request", () => {
  test("a Pix request shows the method, the BRL amount and the code, not the raw template text", () => {
    const el = renderItem(
      paymentRequestMessage({ method: "pix", code: PIX_CODE, amount: "1.00" }),
    )

    expect(el.textContent).toContain("messages.paymentRequest.title")
    expect(el.textContent).toContain(
      "whatsapp.messageTemplate.params.payment.method.pix",
    )
    expect(el.textContent).toContain("R$1.00")
    expect(el.textContent).toContain(PIX_CODE)
    expect(el.textContent).toContain("messages.paymentRequest.status")
    expect(el.textContent).toContain("sentFromTemplate(pagamento_pix_teste)")
    expect(el.textContent).not.toContain("Template: pagamento_pix_teste")
    expect(el.querySelector('button[aria-label="actions.copy"]')).not.toBeNull()
  })

  test("a payment link renders as a safe external anchor", () => {
    const el = renderItem(
      paymentRequestMessage({
        method: "payment_link",
        url: "https://pay.example/checkout/1",
      }),
    )

    const anchor = el.querySelector("a")
    expect(anchor?.getAttribute("href")).toBe("https://pay.example/checkout/1")
    expect(anchor?.getAttribute("rel")).toBe("noopener noreferrer")
  })

  test("a non-http link is shown as text, never as an anchor", () => {
    const el = renderItem(
      paymentRequestMessage({
        method: "payment_link",
        url: "javascript:alert(1)",
      }),
    )

    expect(el.querySelector("a")).toBeNull()
    expect(el.textContent).toContain("javascript:alert(1)")
  })

  test("a one-click card request shows the card ending, the amount and never the credential id", () => {
    const el = renderItem(
      paymentRequestMessage({
        method: "card_on_file",
        lastFourDigits: "4242",
        credentialId: "cred_secret_123",
        amount: "10.00",
      }),
    )

    expect(el.textContent).toContain("messages.paymentRequest.cardEnding(4242)")
    expect(el.textContent).toContain("R$10.00")
    expect(el.textContent).toContain("messages.paymentRequest.cardStatus")
    expect(el.textContent).not.toContain("cred_secret_123")
  })

  test("a template without a parsable payment request keeps its plain text", () => {
    const el = renderItem(paymentRequestMessage({ method: "pix" }))

    expect(el.textContent).toContain("Template: pagamento_pix_teste")
    expect(el.textContent).not.toContain("messages.paymentRequest.title")
  })
})
