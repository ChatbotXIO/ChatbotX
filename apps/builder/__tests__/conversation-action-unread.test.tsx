import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

type ActionOptions = {
  onSuccess?: (result: { data?: unknown }) => void
  onError?: (result: { error: { serverError?: string } }) => void
}
const actionOptionsByAction = new Map<unknown, ActionOptions>()
vi.mock("next-safe-action/hooks", () => ({
  useAction: (action: unknown, options: ActionOptions) => {
    actionOptionsByAction.set(action, options)
    return { execute: vi.fn(), isExecuting: false }
  },
}))

const unreadActionMock = vi.fn()
const bindMock = (action: unknown) => ({ bind: () => action })
vi.mock("@/features/conversations/actions/unread-conversation.action", () => ({
  unreadConversationAction: { bind: () => unreadActionMock },
}))
vi.mock("@/features/conversations/actions/archive-conversation.action", () => ({
  archiveConversationAction: bindMock("archive"),
}))
vi.mock("@/features/conversations/actions/follow-conversation.action", () => ({
  followConversationAction: bindMock("follow"),
}))
vi.mock(
  "@/features/conversations/actions/unarchive-conversation.action",
  () => ({ unarchiveConversationAction: bindMock("unarchive") }),
)
vi.mock(
  "@/features/conversations/actions/unfollow-conversation.action",
  () => ({
    unfollowConversationAction: bindMock("unfollow"),
  }),
)
vi.mock("@/features/contacts/actions/block-contact.action", () => ({
  blockContactAction: bindMock("block"),
}))
vi.mock("@/features/contacts/actions/unblock-contact.action", () => ({
  unblockContactAction: bindMock("unblock"),
}))
vi.mock("@/features/contacts/components/remove-contact-dialog", () => ({
  default: () => null,
}))

const storeState = {
  deleteConversation: vi.fn(),
  updateConversation: vi.fn(),
  resetState: vi.fn(),
  loadMoreConversations: vi.fn(),
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

const { ConversationAction } = await import(
  "@/features/conversations/conversation-action"
)

const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  contact: { fullName: "Ada Lovelace", isBlocked: false },
  contactInboxes: [],
  followed: false,
  archived: false,
  messages: [],
  agentLastReadAt: new Date("2026-01-01T00:00:00Z"),
  contactLastReadAt: null,
  lastActivityAt: new Date("2026-01-01T01:00:00Z"),
} as unknown as ListConversationItemResource

describe("ConversationAction mark unread", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    actionOptionsByAction.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(<ConversationAction conversation={conversation} />)
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const unreadOptions = () => {
    const options = actionOptionsByAction.get(unreadActionMock)
    if (!options?.onSuccess) {
      throw new Error("unread action was not registered")
    }
    return options
  }

  test("mirrors the server's read cursor when it is a timestamp", () => {
    act(() => {
      unreadOptions().onSuccess?.({
        data: { agentLastReadAt: "2025-12-31T00:00:00.000Z" },
      })
    })

    expect(storeState.updateConversation).toHaveBeenCalledWith(
      "conversation-1",
      { agentLastReadAt: new Date("2025-12-31T00:00:00.000Z") },
    )
  })

  // A conversation with a single incoming message is marked unread by
  // clearing the cursor. Turning that null into "now" would show it as read
  // locally while the database says unread.
  test("keeps a null read cursor as null instead of stamping the current time", () => {
    act(() => {
      unreadOptions().onSuccess?.({ data: { agentLastReadAt: null } })
    })

    expect(storeState.updateConversation).toHaveBeenCalledWith(
      "conversation-1",
      { agentLastReadAt: null },
    )
  })
})
