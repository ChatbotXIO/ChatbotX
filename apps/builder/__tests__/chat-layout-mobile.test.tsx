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

const mockRouterReplace = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/w1/inbox",
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => new URLSearchParams("conversationId=c1"),
}))

vi.mock("@/features/chat/chat-panes", () => ({
  ConversationListPane: ({
    autoSelectFirstConversation,
  }: {
    autoSelectFirstConversation?: boolean
  }) => (
    <div
      data-auto-select={String(autoSelectFirstConversation)}
      data-testid="list-pane"
    />
  ),
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

/**
 * Any `height` class on an inbox container is a bug, not a style choice: the
 * height belongs to the shell (`FullBleed` grows to it), and on the desktop
 * group a `height` class is outright dead — `PanelGroup` sets an inline
 * `height: 100%` that no stylesheet rule can beat.
 */
const HEIGHT_CLASS = /(?:^|\s)h-/

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
    mockRouterReplace.mockClear()
  })

  test("shows only the conversation list on mobile with nothing selected", () => {
    setViewportWidth(375)
    render()

    expect(find("list-pane")).not.toBeNull()
    expect(find("thread-pane")).toBeNull()
    // The three-column group must not mount on a phone.
    expect(
      container.querySelector('[data-slot="resizable-panel-group"]'),
    ).toBeNull()
  })

  test("fills the viewport, with the pane owning the whole screen", () => {
    setViewportWidth(375)
    render()

    // The height is derived from the shell (`FullBleed` is a grown flex item),
    // never hand-copied as a viewport unit: a `dvh` here ignores whatever else
    // shares the shell's column, such as the trial banner.
    const pane = find("list-pane")?.closest("div.flex")
    expect(pane?.className).toContain("flex-1")
    expect(pane?.className).not.toMatch(HEIGHT_CLASS)
  })

  test("does not auto-select a conversation on mobile", () => {
    setViewportWidth(375)
    render()

    expect(find("list-pane")?.getAttribute("data-auto-select")).toBe("false")
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

  test("back also clears the conversationId URL param, so a remount cannot resurrect it", () => {
    storeState.activeConversationId = "c1"
    setViewportWidth(375)
    render()

    act(() => {
      find("back")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
    })

    expect(mockRouterReplace).toHaveBeenCalledWith("/space/w1/inbox")
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

  test("grows the desktop group instead of giving it a dead height class", () => {
    storeState.activeConversationId = "c1"
    setViewportWidth(1440)
    render()

    const group = container.querySelector<HTMLElement>(
      '[data-slot="resizable-panel-group"]',
    )
    expect(group?.className).toContain("flex-1")
    expect(group?.className).not.toMatch(HEIGHT_CLASS)
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
