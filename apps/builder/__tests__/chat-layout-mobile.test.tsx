import { setViewportWidth } from "@chatbotx.io/vitest-config/setup-dom"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/features/chat/chat-realtime", () => ({
  ChatRealtime: () => <div data-testid="realtime" />,
}))

vi.mock("@/features/chat/chat-panes", () => ({
  ConversationListPane: () => <div data-testid="list-pane" />,
  MessageThreadPane: ({
    onBack,
    onOpenContact,
  }: {
    onBack?: () => void
    onOpenContact?: () => void
  }) => (
    <div data-testid="thread-pane">
      {onBack && (
        <button data-testid="back" onClick={onBack} type="button">
          back
        </button>
      )}
      {onOpenContact && (
        <button
          data-testid="open-contact"
          onClick={onOpenContact}
          type="button"
        >
          contact
        </button>
      )}
    </div>
  ),
  ContactDetailPane: () => <div data-testid="contact-pane" />,
}))

const storeState = {
  conversations: [] as unknown[],
  isFirstLoadConversation: false,
  isLoadingConversation: false,
  isBootstrappingUrlConversation: false,
  activeConversationId: null as string | null,
  setActiveConversationId: vi.fn((id: string | null) => {
    storeState.activeConversationId = id
  }),
}

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

const { ChatLayout } = await import("@/features/chat/chat-layout")

describe("ChatLayout", () => {
  let container: HTMLDivElement
  let root: Root

  const render = () => {
    act(() => {
      root.render(<ChatLayout workspaceId="w1" />)
    })
  }

  const find = (id: string) =>
    container.querySelector<HTMLElement>(`[data-testid="${id}"]`)

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    storeState.activeConversationId = null
    storeState.setActiveConversationId.mockClear()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    setViewportWidth(1024)
  })

  test("shows only the conversation list on mobile with nothing selected", () => {
    setViewportWidth(375)
    render()

    expect(find("list-pane")).not.toBeNull()
    expect(find("thread-pane")).toBeNull()
    // The three-column group must not mount on a phone.
    expect(container.querySelector("[data-panel-group]")).toBeNull()
  })

  test("fills the viewport, with no shell header height to subtract", () => {
    setViewportWidth(375)
    render()

    // This used to be `calc(100dvh - 3rem)`, a copy of the shell's `h-12`
    // mobile header. The review on #970 removed that header, so the pane owns
    // the whole viewport and no longer tracks a value from another module.
    const pane = find("list-pane")?.closest("div.flex")
    expect(pane?.className).toContain("h-[100dvh]")
  })

  test("shows the thread with a back control once a conversation is active", () => {
    storeState.activeConversationId = "c1"
    setViewportWidth(375)
    render()

    expect(find("thread-pane")).not.toBeNull()
    expect(find("list-pane")).toBeNull()
    expect(find("back")).not.toBeNull()
  })

  test("back clears the active conversation, returning to the list", () => {
    storeState.activeConversationId = "c1"
    setViewportWidth(375)
    render()

    act(() => {
      find("back")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
    })

    expect(storeState.setActiveConversationId).toHaveBeenCalledWith(null)
  })

  test("offers the contact panel behind a control instead of a third column", () => {
    storeState.activeConversationId = "c1"
    setViewportWidth(375)
    render()

    expect(find("open-contact")).not.toBeNull()
    // The sheet is closed until asked for, so the panel is not mounted yet.
    expect(find("contact-pane")).toBeNull()
  })

  test("renders all three panes side by side from md up", () => {
    storeState.activeConversationId = "c1"
    setViewportWidth(1440)
    render()

    expect(find("list-pane")).not.toBeNull()
    expect(find("thread-pane")).not.toBeNull()
    expect(find("contact-pane")).not.toBeNull()
    // No mobile-only affordances leak into the desktop layout.
    expect(find("back")).toBeNull()
    expect(find("open-contact")).toBeNull()
  })

  test("keeps the realtime socket mounted in every layout", () => {
    setViewportWidth(375)
    render()
    expect(find("realtime")).not.toBeNull()

    act(() => {
      setViewportWidth(1440)
    })
    expect(find("realtime")).not.toBeNull()
  })
})
