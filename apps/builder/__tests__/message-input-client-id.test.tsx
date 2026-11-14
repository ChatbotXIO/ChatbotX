import { TOUCH_DEVICE_MEDIA_QUERY } from "@chatbotx.io/ui/hooks/use-touch-device"
import { act, cloneElement, forwardRef, useSyncExternalStore } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useForm } from "react-hook-form"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { WebchatMessageInput } from "@/features/integration-webchat/webchat-message-input"
import { MessageInput } from "@/features/messages/components/message-input"
import { SendQueueRunner } from "@/features/messages/components/send-queue-runner"
import {
  AGENT_SEND_CONFIRM_TIMEOUT_MS,
  AGENT_SEND_GAP_MS,
  createSendQueue,
  type SendQueue,
} from "@/features/messages/lib/send-queue"
import type { CreateMessageWithRoutingBypassRequest } from "@/features/messages/schema/mutation"

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
// The queue runner calls the action directly; the form only `.bind()`s it.
vi.mock("@/features/messages/actions/create-message.action", () => ({
  createMessageAction: Object.assign(
    (_workspaceId: string, _conversationId: string, input: unknown) =>
      action.executeAsync(input),
    { bind: () => "create-message" },
  ),
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "1" }))
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

type InboxSendQueue = SendQueue<CreateMessageWithRoutingBypassRequest>
const storeListeners = new Set<() => void>()
let storeVersion = 0
const notifyStore = () => {
  storeVersion += 1
  for (const listener of storeListeners) {
    listener()
  }
}

/** The composer plus the runner the chat layout mounts beside it. */
const InboxComposer = () => (
  <>
    <MessageInput />
    <SendQueueRunner />
  </>
)

const inboxStore = {
  activeConversationId: "conversation-1",
  appendMessage: vi.fn(),
  markMessagesDeleted: vi.fn(),
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
  sendQueues: {} as Record<string, InboxSendQueue>,
  setReplyToMessage: vi.fn(),
  updateConversation: vi.fn(),
  updateConversationViaMessage: vi.fn(),
  // The same shape as the real store's action: a pure update on one queue.
  updateSendQueue: (
    conversationId: string,
    update: (queue: InboxSendQueue) => InboxSendQueue,
  ) => {
    inboxStore.sendQueues = {
      ...inboxStore.sendQueues,
      [conversationId]: update(
        inboxStore.sendQueues[conversationId] ??
          createSendQueue<CreateMessageWithRoutingBypassRequest>(),
      ),
    }
    notifyStore()
  },
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  // Subscribes to the mutable store so queue updates re-render the composer.
  useChatStore: (selector: (state: typeof inboxStore) => unknown) => {
    useSyncExternalStore(
      (listener) => {
        storeListeners.add(listener)
        return () => storeListeners.delete(listener)
      },
      () => storeVersion,
    )
    return selector(inboxStore)
  },
}))

const guestStore = {
  appendMessage: vi.fn(),
  markMessagesDeleted: vi.fn(),
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
    inboxStore.markMessagesDeleted.mockClear()
    inboxStore.markMessageFailed.mockClear()
    inboxStore.setReplyToMessage.mockClear()
    inboxStore.updateConversationViaMessage.mockClear()
    inboxStore.replyToMessage = null
    inboxStore.isPrivateReply = false
    inboxStore.sendQueues = {}
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

  test("sends rapid inbox messages one at a time, each after the previous one's result", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    try {
      act(() => root.render(<InboxComposer />))
      const textarea = await submitMessages(["1", "2", "3"])

      // Only the first goes out; the rest wait for its answer.
      expect(action.executeAsync).toHaveBeenCalledTimes(1)
      expect(textarea.value).toBe("")

      for (const expected of ["1", "2", "3"]) {
        const input = getSubmittedMessage(
          action.executeAsync.mock.calls.at(-1)?.[0],
        )
        expect(input.text).toBe(expected)
        await act(async () => {
          action.resolveRequests.at(-1)?.({ data: {} })
          await Promise.resolve()
        })
        // The channel accepts it (the realtime answer), then the 500 ms gap.
        act(() => {
          inboxStore.updateSendQueue("conversation-1", (queue) =>
            queue.inFlight?.clientId === input.clientId
              ? {
                  ...queue,
                  inFlight: null,
                  nextAllowedAt: Date.now() + AGENT_SEND_GAP_MS,
                }
              : queue,
          )
        })
        const expectedCalls = Number(expected) + (expected === "3" ? 0 : 1)
        if (expected !== "3") {
          expect(action.executeAsync).toHaveBeenCalledTimes(Number(expected))
          await act(async () => {
            await vi.advanceTimersByTimeAsync(AGENT_SEND_GAP_MS)
          })
        }
        expect(action.executeAsync).toHaveBeenCalledTimes(expectedCalls)
      }
    } finally {
      vi.useRealTimers()
    }
  })

  test("a failed inbox message holds the ones queued behind it and locks the composer", async () => {
    act(() => root.render(<InboxComposer />))

    const textarea = await submitMessages(["1", "2", "3"])
    // The server refuses the first one while the other two are still queued.
    await act(async () => {
      action.resolveRequests[0]?.({ serverError: "Send failed" })
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')).not.toBeNull()
    })
    // Held: nothing after the failed one went out, and the send button is off.
    expect(action.executeAsync).toHaveBeenCalledTimes(1)
    expect(
      container
        .querySelector('[aria-label="Send message"]')
        ?.hasAttribute("disabled"),
    ).toBe(true)
    expect(container.textContent).toContain("messages.sendQueue.failed")

    await act(async () => {
      setTextareaValue(textarea, "4")
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      )
      await Promise.resolve()
    })
    expect(action.executeAsync).toHaveBeenCalledTimes(1)
    expect(textarea.value).toBe("4")
  })

  test("discarding the held messages unlocks the composer", async () => {
    act(() => root.render(<InboxComposer />))
    await submitMessages(["1", "2"])
    await act(async () => {
      action.resolveRequests[0]?.({ serverError: "Send failed" })
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(container.querySelector('[role="alert"]')).not.toBeNull()
    })

    const discard = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "messages.sendQueue.discard",
    )
    act(() => {
      discard?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(inboxStore.sendQueues["conversation-1"]?.waiting).toEqual([])
    // The dropped message's row leaves the thread instead of looking sent.
    const dropped = inboxStore.markMessagesDeleted.mock.calls.at(-1)?.[0]
    expect(dropped).toHaveLength(1)
    expect(
      inboxStore.appendMessage.mock.calls.map(([row]) => row.id),
    ).toContain(dropped?.[0])
  })

  test("a lost answer stops the queue after 30 s and waits for the person, never sending the next by itself", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    try {
      act(() => root.render(<InboxComposer />))
      await submitMessages(["1", "2"])
      expect(action.executeAsync).toHaveBeenCalledTimes(1)

      await act(async () => {
        action.resolveRequests.at(-1)?.({ data: {} })
        await vi.advanceTimersByTimeAsync(AGENT_SEND_CONFIRM_TIMEOUT_MS)
      })

      expect(container.textContent).toContain("messages.sendQueue.unconfirmed")
      expect(action.executeAsync).toHaveBeenCalledTimes(1)

      const proceed = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "messages.sendQueue.continue",
      )
      await act(async () => {
        proceed?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        await vi.advanceTimersByTimeAsync(1)
      })

      expect(action.executeAsync).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  test("queued messages survive a conversation switch", async () => {
    act(() => root.render(<InboxComposer />))
    await submitMessages(["1", "2"])

    inboxStore.activeConversationId = "conversation-2"
    act(() => notifyStore())

    expect(inboxStore.sendQueues["conversation-1"]?.waiting).toHaveLength(1)
    inboxStore.activeConversationId = "conversation-1"
  })

  test("submits every rapid webchat message independently", async () => {
    act(() =>
      root.render(<WebchatMessageInput webchatId="1" workspaceId="1" />),
    )

    await expectRapidSubmissions()
  })

  test("submits an inbox message when Enter is pressed on a desktop keyboard", async () => {
    act(() => root.render(<InboxComposer />))
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
    act(() => root.render(<InboxComposer />))
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
    act(() => root.render(<InboxComposer />))
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

  test("marks an optimistic inbox message failed on a server error; the reply target was already consumed at send time", async () => {
    inboxStore.replyToMessage = {
      createdAt: new Date("2026-01-01T00:00:00Z"),
      id: "message-1",
    } as never
    action.executeAsync.mockResolvedValueOnce({ serverError: "Send failed" })
    act(() => root.render(<InboxComposer />))

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
    expect(inboxStore.setReplyToMessage).toHaveBeenCalledWith(null)
    expect(submittedMessage).toMatchObject({
      replyToMessageId: "message-1",
    })
    expect(disableBotExecute).not.toHaveBeenCalled()
  })

  test("clears selected media at send time and still sends it", async () => {
    action.executeAsync.mockResolvedValueOnce({ serverError: "Send failed" })
    act(() => root.render(<InboxComposer />))
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
    ).toBeNull()
    expect(action.executeAsync.mock.calls[0]?.[0]).toMatchObject({
      mediaFileIds: ["1"],
    })
  })

  test("catches a rejected inbox send and marks its optimistic message failed", async () => {
    action.executeAsync.mockRejectedValueOnce(new Error("Network offline"))
    act(() => root.render(<InboxComposer />))

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
    act(() => root.render(<InboxComposer />))

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
    act(() => root.render(<InboxComposer />))

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
