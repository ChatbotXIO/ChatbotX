import { act, forwardRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WebchatMessageInput } from "@/features/integration-webchat/webchat-message-input"
import { MessageInput } from "@/features/messages/components/message-input"

const ids = vi.hoisted(() => ({ next: 1 }))
const action = vi.hoisted(() => {
  const resolveRequests: Array<(result: { data?: unknown }) => void> = []

  return {
    execute: vi.fn(),
    executeAsync: vi.fn((_: unknown) => {
      const deferred = Promise.withResolvers<{ data?: unknown }>()
      resolveRequests.push(deferred.resolve)
      return deferred.promise
    }),
    resolveRequests,
  }
})
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  // The component's schema transitively imports other utility exports.
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    createId: vi.fn(() => `${ids.next++}`),
  }
})
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isExecuting: false }),
}))
vi.mock("@next-safe-action/adapter-react-hook-form/hooks", () => ({
  useHookFormAction: (
    _action: unknown,
    resolver: Parameters<typeof useForm>[0] extends infer Options
      ? Options extends { resolver?: infer Resolver }
        ? Resolver
        : never
      : never,
    options: { formProps: { defaultValues: unknown } },
  ) => {
    const form = useForm({
      defaultValues: options.formProps.defaultValues as never,
      resolver,
    })
    return {
      action,
      form,
      handleSubmitWithAction: form.handleSubmit((values) =>
        action.execute(values),
      ),
      resetFormAndAction: vi.fn(),
    }
  },
}))
vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}))
vi.mock("@/features/conversations/actions/disable-bot.action", () => ({
  disableBotAction: { bind: () => "disable-bot" },
}))
vi.mock("@/features/conversations/hooks/use-thread-control", () => ({
  useThreadControl: () => null,
}))
vi.mock("@/features/messages/actions/create-message.action", () => ({
  createMessageAction: { bind: () => "create-message" },
}))
vi.mock("@/features/messages/actions/create-webchat-message.action", () => ({
  createWebchatMessageAction: {},
}))
vi.mock("@/features/messages/components/file-upload", () => ({
  FileUploadPreview: forwardRef<HTMLInputElement>((_, ref) => (
    <input ref={ref} />
  )),
}))
vi.mock("@/features/messages/components/input-menu", () => ({
  InputMenu: () => null,
}))
vi.mock("@/features/messages/components/media-file-preview", () => ({
  MediaFilePreview: () => null,
}))
vi.mock(
  "@/features/messages/components/thread-control-locked-composer",
  () => ({
    ThreadControlLockedComposer: () => null,
  }),
)
vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
}))
vi.mock("@/features/saved-replies/quick-replies-popover", () => ({
  QuickRepliesPopover: ({ children }: { children: React.ReactNode }) =>
    children,
}))
vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  InboxIcon: () => null,
}))
vi.mock("@/features/integration-webchat/browser-profile-fields", () => ({
  getWebchatProfileFields: () => ({}),
}))
vi.mock(
  "@/features/integration-webchat/components/webchat-message-menu",
  () => ({
    default: () => null,
  }),
)
vi.mock("@/features/messages/components/emoji-picker", () => ({
  default: () => null,
}))

const inboxStore = {
  activeConversationId: "conversation-1",
  appendMessage: vi.fn(),
  conversations: [
    {
      contactInboxes: [{ channel: "webchat" }],
      id: "conversation-1",
      sourceId: null,
      workspaceId: "1",
    },
  ],
  isPrivateReply: false,
  messages: [],
  replyToMessage: null,
  setReplyToMessage: vi.fn(),
  updateConversation: vi.fn(),
  updateConversationViaMessage: vi.fn(),
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof inboxStore) => unknown) =>
    selector(inboxStore),
}))

const guestStore = {
  appendMessage: vi.fn(),
  guestConversationId: "1:00000000-0000-0000-0000-000000000000",
  sendMessage: vi.fn(),
}
vi.mock(
  "@/features/integration-webchat/providers/store/guest-session-provider",
  () => ({
    useGuestSessionStore: (selector: (state: typeof guestStore) => unknown) =>
      selector(guestStore),
  }),
)

const setTextareaValue = (textarea: HTMLTextAreaElement, value: string) => {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set
  setValue?.call(textarea, value)
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("message composers", () => {
  let container: HTMLDivElement
  let root: Root

  const submitMessages = async (messages: string[]) => {
    const textarea = container.querySelector("textarea")
    if (!textarea) {
      throw new Error("Message composer did not render a textarea")
    }

    for (const message of messages) {
      await act(async () => {
        setTextareaValue(textarea, message)
        textarea.dispatchEvent(
          new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter",
          }),
        )
        await Promise.resolve()
      })

      expect(textarea.value).toBe("")
    }

    return textarea
  }

  const getSubmittedMessage = (input: unknown) => {
    if (
      typeof input !== "object" ||
      input === null ||
      !("clientId" in input) ||
      !("text" in input) ||
      typeof input.clientId !== "string" ||
      typeof input.text !== "string"
    ) {
      throw new Error("Action input must include text and clientId")
    }

    return input
  }

  const expectRapidSubmissions = async () => {
    const textarea = await submitMessages(["1", "2", "3", "4", "5"])

    expect(action.executeAsync).toHaveBeenCalledTimes(5)
    const submittedMessages = action.executeAsync.mock.calls.map(([input]) =>
      getSubmittedMessage(input),
    )
    expect(submittedMessages.map((message) => message.text)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ])
    expect(
      new Set(submittedMessages.map((message) => message.clientId)).size,
    ).toBe(5)
    expect(textarea.value).toBe("")

    await act(async () => {
      setTextareaValue(textarea, "6")
      for (const resolveRequest of action.resolveRequests) {
        resolveRequest({})
      }
      await Promise.resolve()
    })

    expect(textarea.value).toBe("6")

    await act(async () => {
      setTextareaValue(textarea, "")
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      )
      await Promise.resolve()
    })

    expect(action.executeAsync).toHaveBeenCalledTimes(5)
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    action.execute.mockClear()
    action.executeAsync.mockClear()
    action.resolveRequests.length = 0
    guestStore.appendMessage.mockClear()
    guestStore.sendMessage.mockClear()
    ids.next = 1
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("submits every rapid inbox message independently", async () => {
    act(() => root.render(<MessageInput />))

    await expectRapidSubmissions()
  })

  test("submits every rapid webchat message independently", async () => {
    act(() =>
      root.render(<WebchatMessageInput webchatId="1" workspaceId="1" />),
    )

    await expectRapidSubmissions()
  })
})
