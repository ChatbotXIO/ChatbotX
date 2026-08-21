import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { MessageItem } from "@/features/messages/components/message-item"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"

/** Echoes the key back so assertions never depend on the English copy. */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// Base UI's Avatar.Image only mounts once the underlying <img> actually
// fires a load/error event (see useImageLoadingStatus), which jsdom never
// dispatches for a src that isn't really fetched. Mock it down to plain
// markup so this test stays about MessageItem's own avatar-gating logic
// (variant + avatarUrl), not Base UI's async image-loading state machine —
// same approach as add-channel-button.test.tsx for the Tooltip primitives.
vi.mock("@chatbotx.io/ui/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <span data-slot="avatar">{children}</span>
  ),
  AvatarImage: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image-less Avatar primitive
    <img alt={alt} data-slot="avatar-image" height={24} src={src} width={24} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-slot="avatar-fallback">{children}</span>
  ),
}))

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

const AVATAR_URL = "https://cdn.example.com/logo.png"

const makeMessage = (overrides: Partial<MessageResourceWithRelations> = {}) =>
  ({
    id: "msg-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    messageType: "outgoing",
    type: "message",
    text: "Hello from the bot",
    deletedAt: null,
    attributes: null,
    contentAttributes: null,
    attachments: [],
    ...overrides,
  }) as unknown as MessageResourceWithRelations

describe("MessageItem avatar (guest widget showLogo)", () => {
  test("does not render an avatar when avatarUrl is omitted", () => {
    // This is the agent-inbox call shape: no avatarUrl prop at all. Guards
    // against a future change accidentally making the avatar show up (or the
    // gutter reserve) for inbox users, who never pass this prop.
    const el = renderComponent(
      <MessageItem guestDisplay={false} message={makeMessage()} />,
    )

    expect(el.querySelector("img")).toBeNull()
    expect(el.querySelector('[data-slot="avatar"]')).toBeNull()
  })

  test("renders the workspace logo beside an agent/bot bubble in the guest widget", () => {
    const el = renderComponent(
      <MessageItem
        avatarUrl={AVATAR_URL}
        guestDisplay={true}
        message={makeMessage({ messageType: "outgoing" })}
      />,
    )

    const avatar = el.querySelector('[data-slot="avatar-image"]')
    expect(avatar).not.toBeNull()
  })

  test("never renders an avatar on the visitor's own (incoming) bubble", () => {
    // Under guestDisplay, "incoming" maps to variant "right" — the visitor's
    // own messages. avatarUrl must be ignored there even if passed, since the
    // caller (webchat-message-list.tsx) only means it for the agent/bot side.
    const el = renderComponent(
      <MessageItem
        avatarUrl={AVATAR_URL}
        guestDisplay={true}
        message={makeMessage({ messageType: "incoming" })}
      />,
    )

    expect(el.querySelector('[data-slot="avatar-image"]')).toBeNull()
  })
})
