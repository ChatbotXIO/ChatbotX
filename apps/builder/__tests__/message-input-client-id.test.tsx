import { TOUCH_DEVICE_MEDIA_QUERY } from "@chatbotx.io/ui/hooks/use-touch-device"
import { act, cloneElement, forwardRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WebchatMessageInput } from "@/features/integration-webchat/webchat-message-input"
import { MessageInput } from "@/features/messages/components/message-input"

const defaultMatchMedia = window.matchMedia
let isTouchDevice = false

const createMediaQueryList = (
  media: string,
  matches: boolean,
): MediaQueryList =>
  ({
    addEventListener: () => undefined,
    addListener: () => undefined,
    dispatchEvent: () => true,
    matches,
    media,
    onchange: null,
    removeEventListener: () => undefined,
    removeListener: () => undefined,
  }) as MediaQueryList

const ids = vi.hoisted(() => ({ next: 1 }))
const disableBotExecute = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ error: vi.fn() }))
const action = vi.hoisted(() => {
  const resolveRequests: Array<
    (result: {
      data?: unknown
      serverError?: string
      validationErrors?: unknown
    }) => void
  > = []

  return {
    executeAsync: vi.fn((_: unknown) => {
      const deferred = Promise.withResolvers<{
        data?: unknown
        serverError?: string
        validationErrors?: unknown
      }>()
      resolveRequests.push(deferred.resolve)
      return deferred.promise
    }),
    resolveRequests,
  }
})
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({ toast }))
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  // The component's schema transitively imports other utility exports.
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    createId: vi.fn(() => `${ids.next++}`),
  }
})
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: disableBotExecute, isExecuting: false }),
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
  MediaFilePreview: ({ mediaFile }: { mediaFile: { id: string } }) => (
    <span data-testid="media-file-preview">{mediaFile.id}</span>
  ),
}))
vi.mock(
  "@/features/messages/components/thread-control-locked-composer",
  () => ({
    ThreadControlLockedComposer: () => null,
  }),
)
vi.mock("@/features/media-library/components/media-library-trigger", () => ({
  MediaLibraryTrigger: ({
    children,
    onSelect,
  }: {
    children: React.ReactElement<{
      onClick?: React.MouseEventHandler<HTMLElement>
    }>
    onSelect: (file: {
      id: string
      mimeType: string
      name: string
      url: string
    }) => void
  }) =>
    cloneElement(children, {
      onClick: () =>
        onSelect({
          id: "1",
          mimeType: "image/png",
          name: "image.png",
          url: "https://example.com/image.png",
        }),
    }),
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
      botEnabled: true,
      contactInboxes: [{ channel: "webchat" }],
      id: "conversation-1",
      sourceId: null,
      workspaceId: "1",
    },
  ],
  isPrivateReply: false,
  markMessageFailed: vi.fn(),
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
  markMessageFailed: vi.fn(),
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

const createEnterKeyDownEvent = (
  options: { metaKey?: boolean } = {},
): KeyboardEvent =>
  new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "Enter",
    metaKey: options.metaKey ?? false,
  })

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
    isTouchDevice = false
    window.matchMedia = (media) =>
      createMediaQueryList(
        media,
        isTouchDevice && media === TOUCH_DEVICE_MEDIA_QUERY,
      )
    action.executeAsync.mockClear()
    action.resolveRequests.length = 0
    disableBotExecute.mockClear()
    toast.error.mockClear()
    guestStore.appendMessage.mockClear()
    guestStore.markMessageFailed.mockClear()
    guestStore.sendMessage.mockClear()
    inboxStore.appendMessage.mockClear()
    inboxStore.markMessageFailed.mockClear()
    inboxStore.setReplyToMessage.mockClear()
    inboxStore.updateConversationViaMessage.mockClear()
    inboxStore.replyToMessage = null
    inboxStore.isPrivateReply = false
    ids.next = 1
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    window.matchMedia = defaultMatchMedia
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

  test("submits an inbox message when Enter is pressed on a desktop keyboard", async () => {
    act(() => root.render(<MessageInput />))
    const textarea = container.querySelector("textarea")
    if (!textarea) {
      throw new Error("Message composer did not render a textarea")
    }

    expect(textarea.getAttribute("enterkeyhint")).toBe("send")

    const event = createEnterKeyDownEvent()
    await act(async () => {
      setTextareaValue(textarea, "desktop")
      textarea.dispatchEvent(event)
      await Promise.resolve()
    })

    expect(action.executeAsync).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  test("does not submit an inbox message when Enter is pressed on a touch device", async () => {
    isTouchDevice = true
    act(() => root.render(<MessageInput />))
    const textarea = container.querySelector("textarea")
    if (!textarea) {
      throw new Error("Message composer did not render a textarea")
    }

    expect(textarea.getAttribute("enterkeyhint")).toBe("enter")

    const event = createEnterKeyDownEvent()
    await act(async () => {
      setTextareaValue(textarea, "touch")
      textarea.dispatchEvent(event)
      await Promise.resolve()
    })

    expect(action.executeAsync).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  test("submits an inbox message when Cmd+Enter is pressed on a touch device", async () => {
    isTouchDevice = true
    act(() => root.render(<MessageInput />))
    const textarea = container.querySelector("textarea")
    if (!textarea) {
      throw new Error("Message composer did not render a textarea")
    }

    const event = createEnterKeyDownEvent({ metaKey: true })
    await act(async () => {
      setTextareaValue(textarea, "touch shortcut")
      textarea.dispatchEvent(event)
      await Promise.resolve()
    })

    expect(action.executeAsync).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  test("submits a webchat message when Enter is pressed on a desktop keyboard", async () => {
    act(() =>
      root.render(<WebchatMessageInput webchatId="1" workspaceId="1" />),
    )
    const textarea = container.querySelector("textarea")
    if (!textarea) {
      throw new Error("Message composer did not render a textarea")
    }

    expect(textarea.getAttribute("enterkeyhint")).toBe("send")

    const event = createEnterKeyDownEvent()
    await act(async () => {
      setTextareaValue(textarea, "desktop")
      textarea.dispatchEvent(event)
      await Promise.resolve()
    })

    expect(action.executeAsync).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  test("does not submit a webchat message when Enter is pressed on a touch device", async () => {
    isTouchDevice = true
    act(() =>
      root.render(<WebchatMessageInput webchatId="1" workspaceId="1" />),
    )
    const textarea = container.querySelector("textarea")
    if (!textarea) {
      throw new Error("Message composer did not render a textarea")
    }

    expect(textarea.getAttribute("enterkeyhint")).toBe("enter")

    const event = createEnterKeyDownEvent()
    await act(async () => {
      setTextareaValue(textarea, "touch")
      textarea.dispatchEvent(event)
      await Promise.resolve()
    })

    expect(action.executeAsync).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  test("marks an optimistic inbox message failed and keeps its reply target on a server error", async () => {
    inboxStore.replyToMessage = {
      createdAt: new Date("2026-01-01T00:00:00Z"),
      id: "message-1",
    } as never
    action.executeAsync.mockResolvedValueOnce({ serverError: "Send failed" })
    act(() => root.render(<MessageInput />))

    await submitMessages(["hello"])

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Send failed")
    })
    const submittedMessage = getSubmittedMessage(
      action.executeAsync.mock.calls[0]?.[0],
    )
    expect(inboxStore.markMessageFailed).toHaveBeenCalledWith(
      expect.any(String),
      submittedMessage.clientId,
      "Send failed",
    )
    expect(inboxStore.setReplyToMessage).not.toHaveBeenCalled()
    expect(disableBotExecute).not.toHaveBeenCalled()
  })

  test("keeps selected media on an inbox server error", async () => {
    action.executeAsync.mockResolvedValueOnce({ serverError: "Send failed" })
    act(() => root.render(<MessageInput />))
    const mediaLibraryButton = container.querySelector(
      '[aria-label="mediaLibrary.openMediaLibrary"]',
    )
    const form = container.querySelector("form")
    if (!(mediaLibraryButton && form)) {
      throw new Error("Expected the message composer media controls")
    }

    act(() => {
      mediaLibraryButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      )
    })
    expect(
      container.querySelector('[data-testid="media-file-preview"]'),
    ).not.toBeNull()

    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      )
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Send failed")
    })
    expect(
      container.querySelector('[data-testid="media-file-preview"]'),
    ).not.toBeNull()
  })

  test("catches a rejected inbox send and marks its optimistic message failed", async () => {
    action.executeAsync.mockRejectedValueOnce(new Error("Network offline"))
    act(() => root.render(<MessageInput />))

    await submitMessages(["hello"])

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Network offline")
    })
    expect(inboxStore.markMessageFailed).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "Network offline",
    )
    expect(disableBotExecute).not.toHaveBeenCalled()
  })

  test("does not append an optimistic message for a private reply", async () => {
    inboxStore.isPrivateReply = true
    inboxStore.replyToMessage = {
      createdAt: new Date("2026-01-01T00:00:00Z"),
      id: "message-1",
    } as never
    action.executeAsync.mockResolvedValueOnce({ data: {} })
    act(() => root.render(<MessageInput />))

    await submitMessages(["hello"])

    await vi.waitFor(() => {
      expect(disableBotExecute).toHaveBeenCalledWith({
        ids: ["conversation-1"],
      })
    })
    expect(inboxStore.appendMessage).not.toHaveBeenCalled()
    expect(inboxStore.updateConversationViaMessage).not.toHaveBeenCalled()
  })

  test("disables the bot after a successful inbox send", async () => {
    action.executeAsync.mockResolvedValueOnce({ data: {} })
    act(() => root.render(<MessageInput />))

    await submitMessages(["hello"])

    await vi.waitFor(() => {
      expect(disableBotExecute).toHaveBeenCalledWith({
        ids: ["conversation-1"],
      })
    })
  })

  test("shows a webchat server error after an optimistic send", async () => {
    action.executeAsync.mockResolvedValueOnce({ serverError: "Send failed" })
    act(() =>
      root.render(<WebchatMessageInput webchatId="1" workspaceId="1" />),
    )

    await submitMessages(["hello"])

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Send failed")
    })
    expect(guestStore.sendMessage).toHaveBeenCalledWith(
      "hello",
      expect.any(String),
    )
    expect(guestStore.markMessageFailed).toHaveBeenCalledWith(
      expect.any(String),
      "Send failed",
    )
  })

  test("shows a root webchat validation error from the server", async () => {
    action.executeAsync.mockResolvedValueOnce({
      validationErrors: { _errors: ["Guest session expired"] },
    })
    act(() =>
      root.render(<WebchatMessageInput webchatId="1" workspaceId="1" />),
    )

    await submitMessages(["hello"])

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Guest session expired")
    })
    expect(guestStore.markMessageFailed).toHaveBeenCalledWith(
      expect.any(String),
      "Guest session expired",
    )
  })
})
