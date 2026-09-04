import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isExecuting: false }),
}))

vi.mock("@/features/conversations/actions/disable-bot.action", () => ({
  disableBotAction: { bind: () => vi.fn() },
}))

// The three panes import each other's heavy leaves at module scope; only the
// thread pane's own column is under test here.
vi.mock("@/features/contacts/contact-inbox-panel", () => ({
  ContactInboxPanel: () => <div data-testid="contact-panel" />,
}))

vi.mock("@/features/conversations/conversation-list", () => ({
  default: () => <div data-testid="conversation-list" />,
}))

vi.mock("@/features/messages/message-head", () => ({
  default: () => <div data-testid="head" />,
}))

vi.mock("@/features/messages/message-list", () => ({
  MessageList: () => <div data-testid="list" />,
}))

vi.mock("@/features/messages/components/message-input", () => ({
  MessageInput: () => <div data-testid="composer" />,
}))

const storeState = { updateConversation: vi.fn() }

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

const { MessageThreadPane } = await import("@/features/chat/chat-panes")

const activeConversation = {
  id: "c1",
  workspaceId: "w1",
  botEnabled: false,
  botResumeAt: null,
  contactInboxes: [],
  sourceId: null,
} as never

describe("MessageThreadPane", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <MessageThreadPane
          activeConversation={activeConversation}
          isResolvingConversation={false}
          shouldShowEmptyState={false}
          workspaceId="w1"
        />,
      )
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  /**
   * The pane sits in a `ResizablePanel`, whose inner element carries an inline
   * `max-height: 100%; overflow: auto`. `h-full` makes the column fill that
   * box and `min-h-0` lets it shrink inside it — without the pair the column
   * grows to its content and the panel scrolls as a whole, carrying the
   * composer out of view instead of scrolling the message list.
   */
  test("fills its panel and can shrink inside it", () => {
    const column = container.querySelector<HTMLElement>(
      "[data-testid='head']",
    )?.parentElement

    expect(column?.className).toContain("h-full")
    expect(column?.className).toContain("min-h-0")
    expect(column?.className).toContain("flex-col")
  })

  test("keeps the composer as the column's last child", () => {
    const column = container.querySelector<HTMLElement>(
      "[data-testid='head']",
    )?.parentElement

    expect(column?.lastElementChild?.getAttribute("data-testid")).toBe(
      "composer",
    )
  })
})
