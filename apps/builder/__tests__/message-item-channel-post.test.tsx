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

describe("MessageItem channel-post message", () => {
  test("a text-link share shows its text once, in the card, not also in the bubble", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          text: "Summer sale\nhttps://example.com/p/1",
          contentAttributes: {
            type: "channel_post",
            shareMode: "textLink",
            channelPostId: "cp1",
            externalPostId: "ext1",
            permalink: "https://example.com/p/1",
            thumbnail: null,
            caption: "Summer sale",
          },
        })}
      />,
    )

    expect(el.textContent?.match(/Summer sale/g)).toHaveLength(1)
  })

  test("a deleted share shows the deleted placeholder and no post card", () => {
    const el = renderComponent(
      <MessageItem
        message={makeMessage({
          deletedAt: new Date("2024-01-02T00:00:00Z"),
          text: "Summer sale\nhttps://example.com/p/1",
          contentAttributes: {
            type: "channel_post",
            shareMode: "textLink",
            channelPostId: "cp1",
            externalPostId: "ext1",
            permalink: "https://example.com/p/1",
            thumbnail: null,
            caption: "Summer sale",
          },
        })}
      />,
    )

    expect(el.textContent).toContain("messageDeleted")
    expect(el.textContent).not.toContain("Summer sale")
    expect(el.querySelector("a")).toBeNull()
  })
})
