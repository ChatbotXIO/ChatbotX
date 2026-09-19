import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

type VirtuosoCapturedProps = {
  computeItemKey?: (index: number, item: { id: string }) => string
  data: { id: string }[]
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
  default: () => <div />,
}))

vi.mock("@/features/conversations/conversation-filter", () => ({
  ConversationFilter: () => <div />,
}))

vi.mock("@/features/contacts/create-contact-dialog", () => ({
  CreateContactDialog: () => <div />,
}))

const storeState = {
  conversations: [{ id: "conv-2" }, { id: "conv-1" }] as { id: string }[],
  loadMoreConversations: vi.fn().mockResolvedValue(undefined),
  filters: {},
  setFilters: vi.fn(),
  resetState: vi.fn(),
  nextCursorConversation: null as string | null,
  isLoadingConversation: false,
  setActiveConversationId: vi.fn(),
  initActiveConversationFromUrl: vi.fn().mockResolvedValue(undefined),
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

vi.mock("@/features/conversations/hooks/use-conversation-id-param", () => ({
  useConversationIdParam: () => ({
    set: vi.fn(),
    clear: vi.fn(),
  }),
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
})
