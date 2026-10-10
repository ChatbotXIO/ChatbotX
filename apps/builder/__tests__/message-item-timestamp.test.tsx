import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { MessageItem } from "@/features/messages/components/message-item"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// See message-item-avatar.test.tsx: these pull `"use server"` modules into
// the browser preset. Both are irrelevant to the timestamp.
vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: () => null,
}))
vi.mock("@/features/messages/components/whatsapp-call-card", () => ({
  WhatsappCallCard: () => <div data-slot="whatsapp-call-card">audioCall</div>,
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

const CREATED_AT = new Date("2024-01-01T00:00:00Z")

const makeMessage = (overrides: Partial<MessageResourceWithRelations> = {}) =>
  ({
    id: "msg-1",
    workspaceId: "ws-1",
    conversationId: "conv-1",
    createdAt: CREATED_AT,
    messageType: "outgoing",
    type: "message",
    text: "Hello",
    deletedAt: null,
    attributes: null,
    contentAttributes: null,
    attachments: [],
    ...overrides,
  }) as unknown as MessageResourceWithRelations

describe("MessageItem timestamp", () => {
  test.each([
    "incoming",
    "outgoing",
  ] as const)("renders the %s message time as a hover-revealed <time> instead of a native title", (messageType) => {
    const el = renderComponent(
      <MessageItem message={makeMessage({ messageType })} />,
    )

    const time = el.querySelector("time")
    expect(time).not.toBeNull()
    expect(time?.getAttribute("dateTime")).toBe(CREATED_AT.toISOString())
    // Revealed by the bubble's hover/focus, not an OS tooltip with its own
    // delay.
    expect(time?.className).toContain("group-hover:opacity-100")
    expect(time?.className).toContain("group-focus-within:opacity-100")
    expect(el.querySelector("[title]")).toBeNull()
  })

  test("renders no timestamp on a full-width activity row", () => {
    const el = renderComponent(
      <MessageItem message={makeMessage({ messageType: "activity" })} />,
    )

    expect(el.querySelector("time")).toBeNull()
  })
})
