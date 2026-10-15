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

const reference = (
  retailerId: string,
  name: string | null,
): Record<string, unknown> => ({
  catalogReference: { source: "metaCatalog", catalogId: "cat-1", retailerId },
  product: name
    ? {
        productId: `id-${retailerId}`,
        name,
        imageUrl: null,
        price: 10,
        currency: "USD",
      }
    : null,
})

describe("MessageItem inbound catalog messages", () => {
  test("a stored cart renders as a cart bubble instead of its plain-text summary", () => {
    const el = renderItem(
      makeMessage({
        text: "Received order\nSUMMARY-LINE",
        contentAttributes: {
          catalog_id: "cat-1",
          inboundOrder: {
            note: null,
            items: [
              {
                ...reference("sku-1", "Red shoes"),
                quantity: 2,
                itemPrice: 10,
                currency: "USD",
              },
            ],
          },
        },
      }),
    )

    expect(el.textContent).toContain("Red shoes")
    expect(el.textContent).toContain("2 × $10.00")
    expect(el.textContent).not.toContain("SUMMARY-LINE")
  })

  test("a cart without the stored entity keeps showing its plain-text summary", () => {
    const el = renderItem(
      makeMessage({
        text: "Received order\nSUMMARY-LINE",
        contentAttributes: { catalog_id: "cat-1" },
      }),
    )

    expect(el.textContent).toContain("SUMMARY-LINE")
  })

  test("a product question shows the referred product beside the contact's own text", () => {
    const el = renderItem(
      makeMessage({
        text: "Is this in stock?",
        contentAttributes: {
          referredProduct: reference("sku-1", "Red shoes"),
        },
      }),
    )

    expect(el.textContent).toContain("Is this in stock?")
    expect(el.textContent).toContain("Red shoes")
    expect(el.textContent).toContain("askedAbout")
  })

  test("a product the workspace could not match still shows the channel's id", () => {
    const el = renderItem(
      makeMessage({
        text: "Is this in stock?",
        contentAttributes: { referredProduct: reference("sku-unknown", null) },
      }),
    )

    expect(el.textContent).toContain("sku-unknown")
  })
})
