import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isExecuting: false }),
}))

vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: () => {
    const form = useForm({ defaultValues: { text: "", files: [] } })
    return {
      form,
      handleSubmitWithAction: vi.fn(),
      resetFormAndAction: vi.fn(),
    }
  },
}))

vi.mock("@/features/conversations/actions/disable-bot.action", () => ({
  disableBotAction: { bind: () => "disable-bot" },
}))
vi.mock("@/features/messages/actions/create-message.action", () => ({
  createMessageAction: { bind: () => "create-message" },
}))
vi.mock("@/features/messages/components/input-menu", () => ({
  InputMenu: () => null,
}))
vi.mock("@/features/messages/components/file-upload", () => ({
  FileUploadPreview: () => null,
}))
vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: () => null,
}))
vi.mock("@/features/saved-replies/quick-replies-popover", () => ({
  QuickRepliesPopover: ({ children }: { children: React.ReactNode }) =>
    children,
}))
vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: () => null,
}))

const lifecycle = vi.hoisted(() => ({ mounts: [] as string[] }))
vi.mock(
  "@/features/messages/components/thread-control-locked-composer",
  () => ({
    ThreadControlLockedComposer: ({
      conversationId,
    }: {
      conversationId: string
    }) => {
      // Records one entry per component instance (the lazy initializer runs
      // once per mount): a remount is what resets the card's own spinner /
      // inline-refusal state, while a plain re-render must not add one.
      useState(() => lifecycle.mounts.push(conversationId))
      return <div data-testid="locked">{conversationId}</div>
    },
  }),
)

const lockedInbox = (id: string) => ({
  id,
  channel: "whatsapp",
  lastIncomingMessageAt: new Date(),
  threadControlState: "standby",
  threadOwnerRole: "ai_agent",
  threadControlUpdatedAt: new Date(),
})

const storeState = {
  appendMessage: vi.fn(),
  updateConversationViaMessage: vi.fn(),
  updateConversation: vi.fn(),
  setReplyToMessage: vi.fn(),
  replyToMessage: null,
  isPrivateReply: false,
  messages: [],
  activeConversationId: "conv-1",
  conversations: [
    {
      id: "conv-1",
      workspaceId: "ws-1",
      sourceId: null,
      contactInboxes: [lockedInbox("ci-1")],
    },
    {
      id: "conv-2",
      workspaceId: "ws-1",
      sourceId: null,
      contactInboxes: [lockedInbox("ci-2")],
    },
  ],
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

const { MessageInput } = await import(
  "@/features/messages/components/message-input"
)

describe("MessageInput — conversation-routing lock", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    lifecycle.mounts = []
    storeState.activeConversationId = "conv-1"
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("remounts the locked card when switching to another locked conversation", () => {
    act(() => root.render(<MessageInput />))
    expect(container.querySelector('[data-testid="locked"]')?.textContent).toBe(
      "conv-1",
    )

    storeState.activeConversationId = "conv-2"
    act(() => root.render(<MessageInput />))

    expect(container.querySelector('[data-testid="locked"]')?.textContent).toBe(
      "conv-2",
    )
    expect(lifecycle.mounts).toEqual(["conv-1", "conv-2"])
  })

  test("re-rendering the same conversation keeps the same card instance", () => {
    act(() => root.render(<MessageInput />))
    act(() => root.render(<MessageInput />))

    expect(lifecycle.mounts).toEqual(["conv-1"])
  })
})
