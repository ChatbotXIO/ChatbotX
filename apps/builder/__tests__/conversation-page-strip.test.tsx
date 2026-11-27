import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"
import type { InboxAvatarResource } from "@/features/inboxes/schema/action"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
  useFormatter: () => ({ dateTime: (at: Date) => at.toISOString() }),
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    inboxesAPI: {
      listInboxAvatarsAuthenticatedAPI: { queryOptions: () => ({}) },
    },
  },
}))

const avatarState = { data: [] as InboxAvatarResource[] }
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { data: avatarState.data } }),
}))

const { ConversationPageStrip } = await import(
  "@/features/conversations/components/conversation-page-strip"
)

const contactInbox = (inboxId: string, channel: string, name: string) => ({
  channel,
  id: `ci-${inboxId}`,
  inbox: { name },
  inboxId,
  lastMessageAt: new Date(Date.UTC(2026, 10, 20)),
})

const conversation = (
  contactInboxes: ReturnType<typeof contactInbox>[],
): ListConversationItemResource =>
  ({
    contactInboxes,
    id: "conv-1",
    messages: [],
  }) as unknown as ListConversationItemResource

describe("ConversationPageStrip page link", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (item: ListConversationItemResource) =>
    act(() => {
      root.render(<ConversationPageStrip conversation={item} />)
    })

  test("a page with a URL opens on its network in a new tab", async () => {
    avatarState.data = [
      {
        avatar: null,
        inboxId: "1",
        profileUrl: "https://www.facebook.com/123",
        provider: "facebook",
      },
    ]
    await render(conversation([contactInbox("1", "messenger", "My Page")]))

    const link = container.querySelector("a")
    expect(link?.getAttribute("href")).toBe("https://www.facebook.com/123")
    expect(link?.getAttribute("target")).toBe("_blank")
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer")
    expect(link?.getAttribute("aria-label")).toBe(
      "composer.openProfile:My Page|Facebook",
    )
    expect(link?.textContent).toContain("My Page")
  })

  test("an Instagram page is labelled Instagram", async () => {
    avatarState.data = [
      {
        avatar: null,
        inboxId: "2",
        profileUrl: "https://www.instagram.com/shop",
        provider: "instagram",
      },
    ]
    await render(conversation([contactInbox("2", "instagram", "Shop IG")]))

    expect(container.querySelector("a")?.getAttribute("aria-label")).toBe(
      "composer.openProfile:Shop IG|Instagram",
    )
  })

  test("a page without a URL stays plain text", async () => {
    avatarState.data = [
      { avatar: null, inboxId: "1", profileUrl: null, provider: "facebook" },
    ]
    await render(conversation([contactInbox("1", "whatsapp", "Shop line")]))

    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toContain("Shop line")
  })

  test("a non-web URL is never linked", async () => {
    avatarState.data = [
      {
        avatar: null,
        inboxId: "1",
        profileUrl: "javascript:alert(1)",
        provider: "facebook",
      },
    ]
    await render(conversation([contactInbox("1", "messenger", "My Page")]))

    expect(container.querySelector("a")).toBeNull()
  })
})
