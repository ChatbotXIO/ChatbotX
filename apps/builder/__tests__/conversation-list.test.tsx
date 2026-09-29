import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

type VirtuosoCapturedProps = {
  computeItemKey?: (index: number, item: { id: string }) => string
  data: { id: string }[]
  itemContent?: (index: number, item: { id: string }) => React.ReactNode
}

const capturedProps: { current: VirtuosoCapturedProps | null } = {
  current: null,
}

vi.mock("react-virtuoso", () => ({
  Virtuoso: (props: VirtuosoCapturedProps) => {
    capturedProps.current = props
    return <div data-testid="virtuoso" />
  },
}))

vi.mock("@/features/conversations/conversation-item", () => ({
  default: ({ onSelect }: { onSelect: () => void }) => (
    <button onClick={onSelect} type="button">
      conversation
    </button>
  ),
}))

vi.mock("@/features/conversations/conversation-filter", () => ({
  ConversationFilter: () => <div />,
}))

vi.mock("@/features/contacts/create-contact-dialog", () => ({
  CreateContactDialog: () => <div />,
}))

vi.mock("@/features/users/provider/user-hook", () => ({
  useContactAssigneeOptions: () => [],
}))

const storeState = {
  conversations: [{ id: "conv-2" }, { id: "conv-1" }] as { id: string }[],
  loadMoreConversations: vi.fn().mockResolvedValue(undefined),
  filters: {},
  setFilters: vi.fn(),
  resetState: vi.fn(),
  nextCursorConversation: null as string | null,
  isFirstLoadConversation: true,
  isLoadingConversation: false,
  setActiveConversationId: vi.fn(),
  prependConversation: vi.fn(),
  initActiveConversationFromUrl: vi.fn().mockResolvedValue(undefined),
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

const conversationIdParamMock = { set: vi.fn(), clear: vi.fn() }
vi.mock("@/features/conversations/hooks/use-conversation-id-param", () => ({
  useConversationIdParam: () => conversationIdParamMock,
}))

const { default: ConversationList } = await import(
  "@/features/conversations/conversation-list"
)

describe("ConversationList", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    storeState.isFirstLoadConversation = true
    capturedProps.current = null
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("passes a stable computeItemKey keyed by conversation id to Virtuoso", () => {
    act(() => {
      root.render(<ConversationList workspaceId="ws-1" />)
    })

    expect(capturedProps.current?.computeItemKey).toBeInstanceOf(Function)
    const item = { id: "conv-42" }
    expect(capturedProps.current?.computeItemKey?.(0, item)).toBe("conv-42")
  })

  test("loads the first conversation page once when the server did not seed it", () => {
    act(() => {
      root.render(<ConversationList workspaceId="ws-1" />)
    })

    expect(storeState.loadMoreConversations).toHaveBeenCalledTimes(1)
  })

  test("skips the mount load when the server already seeded the first page", () => {
    storeState.isFirstLoadConversation = false

    act(() => {
      root.render(<ConversationList workspaceId="ws-1" />)
    })

    expect(storeState.loadMoreConversations).not.toHaveBeenCalled()
  })

  test("selects the clicked conversation without reordering the list", () => {
    act(() => {
      root.render(<ConversationList workspaceId="ws-1" />)
    })

    const selected = storeState.conversations[1]
    const item = capturedProps.current?.itemContent?.(
      1,
      selected,
    ) as ReactElement<{
      onSelect: () => void
    }>
    act(() => {
      item.props.onSelect()
    })

    expect(conversationIdParamMock.set).toHaveBeenCalledWith(selected.id)
    expect(storeState.setActiveConversationId).toHaveBeenCalledWith(selected.id)
    expect(storeState.prependConversation).not.toHaveBeenCalled()
    expect(storeState.conversations.map(({ id }) => id)).toEqual([
      "conv-2",
      "conv-1",
    ])
  })
})
