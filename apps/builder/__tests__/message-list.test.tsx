// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MessageList } from "@/features/messages/message-list"

const { virtuosoPropsRef } = vi.hoisted(() => ({
  virtuosoPropsRef: {
    current: null as {
      firstItemIndex: number
      startReached: () => void
    } | null,
  },
}))

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
  lastPrependedCount: 0,
  loadInitialMessages: loadInitialMessagesMock,
  loadMoreMessages: loadMoreMessagesMock,
  markMessagesDeleted: vi.fn(),
  markMessagesRestored: vi.fn(),
  messages: [] as { id: string; messageType: string }[],
  prependSeq: 0,
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
  Virtuoso: ({
    firstItemIndex,
    startReached,
  }: {
    firstItemIndex: number
    startReached: () => void
  }) => {
    virtuosoPropsRef.current = { firstItemIndex, startReached }
    return (
      <div data-first-item-index={firstItemIndex} data-testid="message-list" />
    )
  },
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
    chatStoreState.hasNextMessagePage = false
    chatStoreState.isLoadMoreMessage = false
    chatStoreState.lastPrependedCount = 0
    chatStoreState.messages = []
    chatStoreState.prependSeq = 0
    virtuosoPropsRef.current = null
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

  test("shifts the list index by only the prepended count when realtime also appends", () => {
    const olderMessage = {
      id: "message-0",
      messageType: "incoming",
    }
    const existingMessage = {
      id: "message-1",
      messageType: "incoming",
    }
    const incomingMessage = {
      id: "message-2",
      messageType: "incoming",
    }
    chatStoreState.hasNextMessagePage = true
    chatStoreState.messages = [existingMessage]

    render()

    const startReached = virtuosoPropsRef.current?.startReached
    expect(startReached).toBeDefined()
    act(() => {
      startReached?.()
    })
    expect(loadMoreMessagesMock).toHaveBeenCalledWith("workspace-1", 20)

    chatStoreState.lastPrependedCount = 1
    chatStoreState.messages = [olderMessage, existingMessage, incomingMessage]
    chatStoreState.prependSeq = 1
    render()

    expect(
      container
        .querySelector("[data-testid='message-list']")
        ?.getAttribute("data-first-item-index"),
    ).toBe("99999")
  })
})
