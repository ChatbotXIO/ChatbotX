import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useStore } from "zustand"

const mocks = vi.hoisted(() => ({
  createMessage: vi.fn(),
  toast: { error: vi.fn(), warning: vi.fn() },
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "w1" }))
vi.mock("@/lib/orpc/orpc", () => ({ client: {} }))
vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock("@/features/messages/actions/create-message.action", () => ({
  createMessageAction: mocks.createMessage,
}))

const { createChatStore } = await import(
  "../../src/features/chat/store/chat-store"
)
type Store = ReturnType<typeof createChatStore>
let store: Store
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: <T,>(selector: (state: ReturnType<Store["getState"]>) => T) =>
    useStore(store, selector),
}))

const { useSendQueueRunner } = await import(
  "@/features/messages/lib/use-send-queue-runner"
)
const { enqueueSend } = await import("@/features/messages/lib/send-queue")
const { useTranslationUiStore } = await import(
  "@/features/translation/store/translation-ui-store"
)

const NOW = new Date("2026-11-20T00:00:00.000Z")

const optimistic = (clientId: string) => ({
  id: `opt-${clientId}`,
  clientId,
  workspaceId: "w1",
  conversationId: "c1",
  contactInboxId: "",
  createdAt: NOW,
  updatedAt: NOW,
  messageType: "outgoing",
  contentType: "text",
  type: "message",
  text: `text ${clientId}`,
  senderType: "user",
  senderId: "u1",
  sourceId: null,
  contentAttributes: null,
  deletedAt: null,
  parentId: null,
  attributes: null,
  sendError: null,
})

const queued = (clientId: string, translate: boolean) => ({
  clientId,
  optimisticMessageId: `opt-${clientId}`,
  input: {
    text: `text ${clientId}`,
    clientId,
    ...(translate ? { translate: true } : {}),
  } as never,
})

const setup = (items: ReturnType<typeof queued>[]) => {
  store = createChatStore({
    activeConversationId: "c1",
    conversations: [
      {
        id: "c1",
        workspaceId: "w1",
        contactId: "contact-1",
        messages: [],
        lastActivityAt: NOW,
        additionalAttributes: {
          translation: { language: "es", languageSource: "auto" },
        },
      },
    ] as never,
    messagesSeed: {
      messages: items.map((item) => optimistic(item.clientId)) as never,
      nextCursorMessage: null,
      hasNextMessagePage: false,
      messagesConversationId: "c1",
    },
  })
  store
    .getState()
    .updateSendQueue("c1", (queue) =>
      items.reduce((next, item) => enqueueSend(next, item), queue),
    )
  const Runner = () => {
    useSendQueueRunner({ onSubmitted: vi.fn() })
    return null
  }
  container = document.createElement("div")
  root = createRoot(container)
  act(() => {
    root?.render(<Runner />)
  })
}

let container: HTMLElement | null = null
let root: Root | null = null

/** Retries `assertion` while React and the mocked action settle. */
const waitFor = async (assertion: () => void, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      assertion()
      return
    } catch (error) {
      if (Date.now() > deadline) {
        throw error
      }
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
    }
  }
}

const message = (clientId: string) =>
  store.getState().messages.find((m) => m.clientId === clientId)
const status = (clientId: string) =>
  useTranslationUiStore.getState().outgoing[clientId]

beforeEach(() => {
  vi.clearAllMocks()
  useTranslationUiStore.setState({ outgoing: {} })
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  container = null
})

describe("a message whose translation failed", () => {
  test("is marked 'Translation failed', with no toast, and the next message still goes", async () => {
    mocks.createMessage
      .mockResolvedValueOnce({
        data: {
          translationNotSent: {
            reason: "timeout",
            conversationTranslation: "on",
          },
        },
      })
      .mockResolvedValueOnce({ data: { id: "m2" } })

    setup([queued("a", true), queued("b", true)])

    await waitFor(() =>
      expect(message("a")?.sendError).toBe("inboxTranslation.send.failed"),
    )
    expect(status("a")).toBe("failed")
    // Not held: the composer stays open and the next message is sent.
    await waitFor(() => expect(mocks.createMessage).toHaveBeenCalledTimes(2))
    expect(store.getState().sendQueues.c1?.holdReason ?? null).toBeNull()
    expect(mocks.toast.error).not.toHaveBeenCalled()
    expect(mocks.toast.warning).not.toHaveBeenCalled()
  })

  test("after an AI provider failure, turns translation off and fails what was queued to be translated", async () => {
    mocks.createMessage
      .mockResolvedValueOnce({
        data: {
          translationNotSent: {
            reason: "providerError",
            conversationTranslation: "off",
          },
        },
      })
      .mockResolvedValue({ data: { id: "m-plain" } })

    setup([queued("a", true), queued("b", true), queued("c", false)])

    await waitFor(() =>
      expect(mocks.toast.warning).toHaveBeenCalledWith(
        "inboxTranslation.send.turnedOff",
      ),
    )
    expect(status("a")).toBe("failed")
    expect(status("b")).toBe("failed")
    expect(message("b")?.sendError).toBe("inboxTranslation.send.failed")
    expect(
      store.getState().conversations[0]?.additionalAttributes,
    ).toMatchObject({ translation: { enabledOverride: false } })
    // The message written to be translated is never sent as written; the one
    // that was not to be translated still goes.
    await waitFor(() => expect(mocks.createMessage).toHaveBeenCalledTimes(2))
    expect(mocks.createMessage.mock.calls[1]?.[2]).toMatchObject({
      clientId: "c",
    })
  })

  test("shows 'Translating…' while waiting, and clears it once sent", async () => {
    let answer: (value: unknown) => void = () => undefined
    mocks.createMessage.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve
      }),
    )

    setup([queued("a", true)])

    await waitFor(() => expect(status("a")).toBe("translating"))
    answer({ data: { id: "m1" } })
    await waitFor(() => expect(status("a")).toBeUndefined())
    expect(message("a")?.sendError).toBeNull()
  })
})
