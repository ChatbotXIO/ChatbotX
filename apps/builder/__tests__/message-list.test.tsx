// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MessageList } from "@/features/messages/message-list"

const loadInitialMessagesMock = vi.fn()
const loadMoreMessagesMock = vi.fn()

const chatStoreState = {
  activeConversationId: "conversation-1" as string | null,
  conversations: [
    {
      id: "conversation-1",
      contactInboxes: [],
    },
    {
      id: "conversation-2",
      contactInboxes: [],
    },
  ],
  hasNextMessagePage: false,
  isLoadMoreMessage: false,
  loadInitialMessages: loadInitialMessagesMock,
  loadMoreMessages: loadMoreMessagesMock,
  markMessagesDeleted: vi.fn(),
  markMessagesRestored: vi.fn(),
  messages: [],
  setReplyToMessage: vi.fn(),
  updateMessageAttributes: vi.fn(),
  updateMessageText: vi.fn(),
}

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn() }),
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: <T,>(selector: (state: typeof chatStoreState) => T) =>
    selector(chatStoreState),
}))

vi.mock("@/features/messages/actions/change-message-attributes.action", () => ({
  changeMessageAttributesAction: vi.fn(),
}))

vi.mock("@/features/messages/actions/delete-message.action", () => ({
  deleteMessageAction: vi.fn(),
}))

vi.mock("@/features/messages/actions/edit-message.action", () => ({
  editMessageAction: vi.fn(),
}))

vi.mock("@/features/conversations/components/conversation-info", () => ({
  ConversationInfo: () => null,
}))

vi.mock("@/features/messages/components/message-item", () => ({
  MessageItem: () => null,
}))

vi.mock("@/features/messages/lib/private-reply", () => ({
  canPrivateReplyToComment: () => false,
}))

vi.mock("react-virtuoso", () => ({
  Virtuoso: () => <div data-testid="message-list" />,
}))

describe("MessageList", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    chatStoreState.activeConversationId = "conversation-1"
    loadInitialMessagesMock.mockReset()
    loadMoreMessagesMock.mockReset()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const render = () => {
    act(() => {
      root.render(<MessageList />)
    })
  }

  test("uses the initial loader for a seeded active conversation", async () => {
    render()

    await vi.waitFor(() => {
      expect(loadInitialMessagesMock).toHaveBeenCalledWith("workspace-1", 20)
    })
    expect(loadMoreMessagesMock).not.toHaveBeenCalled()
  })

  test("uses the initial loader again after switching conversations", async () => {
    render()

    await vi.waitFor(() => {
      expect(loadInitialMessagesMock).toHaveBeenCalledTimes(1)
    })

    chatStoreState.activeConversationId = "conversation-2"
    render()

    await vi.waitFor(() => {
      expect(loadInitialMessagesMock).toHaveBeenCalledTimes(2)
    })
    expect(loadInitialMessagesMock).toHaveBeenLastCalledWith("workspace-1", 20)
    expect(loadMoreMessagesMock).not.toHaveBeenCalled()
  })
})
