import type { TenantSettings } from "@chatbotx.io/business"
import { isNativeButtonType } from "@chatbotx.io/flow-config"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
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

// The carousel (embla) observes its slides; jsdom has no IntersectionObserver.
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
)

let container: HTMLDivElement | null = null
let root: Root | null = null

const tenantSettings = {
  storageUrl: "https://cdn.example.com",
} as unknown as TenantSettings

const renderItem = (
  message: MessageResourceWithRelations,
  onPostback?: (button: MessageButtonTemplate) => void,
) => {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <TenantProvider settings={tenantSettings}>
        <MessageItem message={message} onPostback={onPostback} />
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

const phoneButton = {
  id: "1",
  label: "Call us",
  buttonType: "phoneNumber",
  phoneNumber: "+14155552671",
  postback: "payload",
} as const

const postbackButton = {
  id: "2",
  label: "More",
  buttonType: "postback",
  postback: "more",
} as const

const buttonTemplate = (buttons: unknown[]) =>
  makeMessage({
    text: "Need help?",
    contentAttributes: {
      type: "template",
      payload: { templateType: "button", buttons },
    },
  })

const carouselTemplate = (buttons: unknown[]) =>
  makeMessage({
    text: "Need help?",
    contentAttributes: {
      type: "template",
      payload: {
        templateType: "carousel",
        cards: [{ id: "c1", title: "Card", buttons }],
      },
    },
  })

describe("MessageItem call phone number buttons", () => {
  test("the webchat policy declares the tel: link this view renders", () => {
    expect(isNativeButtonType("webchat", "callPhoneNumber")).toBe(true)
  })

  test("a button template renders a call button as a tel: link", () => {
    const el = renderItem(buttonTemplate([phoneButton]))
    const link = el.querySelector("a[href^='tel:']")

    expect(link?.getAttribute("href")).toBe("tel:+14155552671")
    expect(link?.textContent).toContain("Call us")
  })

  test("a carousel card renders a call button as a tel: link", () => {
    const el = renderItem(carouselTemplate([phoneButton]))

    expect(
      el.querySelector("a[href='tel:+14155552671']")?.textContent,
    ).toContain("Call us")
  })

  test("a number that is not plain E.164 never becomes a tel: link", () => {
    const el = renderItem(
      buttonTemplate([{ ...phoneButton, phoneNumber: "javascript:alert(1)" }]),
    )

    expect(el.querySelector("a[href^='tel:']")).toBeNull()
    expect(el.querySelector("a[href^='javascript']")).toBeNull()
  })

  test("a postback button still replies when tapped", () => {
    const onPostback = vi.fn()
    const el = renderItem(buttonTemplate([postbackButton]), onPostback)

    act(() => {
      el.querySelector("button")?.click()
    })

    expect(onPostback).toHaveBeenCalledWith(postbackButton)
  })

  test("a postback button on a carousel card replies when tapped", () => {
    const onPostback = vi.fn()
    const el = renderItem(carouselTemplate([postbackButton]), onPostback)

    act(() => {
      el.querySelector("button")?.click()
    })

    expect(onPostback).toHaveBeenCalledWith(postbackButton)
  })
})
