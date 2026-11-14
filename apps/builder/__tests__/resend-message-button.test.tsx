import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ResendMessageButton } from "@/features/messages/components/resend-message-button"
import type { SendQueue } from "@/features/messages/lib/send-queue"
import {
  createSendQueue,
  enqueueSend,
  failSendSubmit,
  markResendSubmitted,
  markSendSubmitted,
} from "@/features/messages/lib/send-queue"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toast = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock("sonner", () => ({ toast }))

const resendAction = vi.hoisted(() => vi.fn())
vi.mock("@/features/messages/actions/resend-message.action", () => ({
  resendMessageAction: resendAction,
}))

const store = vi.hoisted(() => ({
  markMessageFailed: vi.fn(),
  updateSendQueue: vi.fn(),
  updateAllSendQueues: vi.fn(),
}))
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof store) => unknown) => selector(store),
}))

const MESSAGE = {
  id: "msg-1",
  createdAt: new Date("2026-07-09T08:37:21.108Z"),
  conversationId: "conv-1",
  workspaceId: "ws-1",
  clientId: "c-1",
  sendError: "(#10) permission denied",
}

let container: HTMLDivElement | null = null
let root: Root | null = null

const render = () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<ResendMessageButton message={MESSAGE} />)
  })
  // biome-ignore lint/style/noNonNullAssertion: assigned synchronously above
  return container!
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  vi.clearAllMocks()
})

const press = async (el: HTMLElement) => {
  await act(() => {
    el.querySelector("button")?.click()
    return Promise.resolve()
  })
}

const lastQueueUpdate = (index: number) => {
  const [conversationId, update] = store.updateSendQueue.mock.calls[index] as [
    string,
    (queue: SendQueue<unknown>) => SendQueue<unknown>,
  ]
  return { conversationId, update }
}

describe("ResendMessageButton", () => {
  test("is labelled with the shared Resend key", () => {
    expect(render().textContent).toContain("actions.resend")
  })

  test("pressing it resends this message by id and createdAt in its workspace and conversation", async () => {
    resendAction.mockResolvedValue({ data: { id: "msg-1", queued: true } })
    await press(render())

    expect(resendAction).toHaveBeenCalledWith("ws-1", "conv-1", {
      id: "msg-1",
      createdAt: MESSAGE.createdAt,
    })
  })

  test("the badge clears and the queue tracks the message BEFORE the request returns", async () => {
    let finish: (value: unknown) => void = () => undefined
    resendAction.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const el = render()
    await press(el)

    expect(store.markMessageFailed).toHaveBeenCalledWith(
      "msg-1",
      undefined,
      null,
    )
    const { conversationId, update } = lastQueueUpdate(0)
    expect(conversationId).toBe("conv-1")
    expect(update(createSendQueue()).inFlight?.messageId).toBe("msg-1")
    expect(el.querySelector("button")?.disabled).toBe(true)

    await act(async () => finish({ data: { id: "msg-1", queued: true } }))
    expect(toast.error).not.toHaveBeenCalled()
    expect(store.markMessageFailed).toHaveBeenCalledTimes(1)
  })

  test("a refusal (409) restores the failure and the hold, and shows the server message", async () => {
    resendAction.mockResolvedValue({
      serverError: "This message cannot be resent",
    })
    await press(render())

    expect(toast.error).toHaveBeenCalledWith("This message cannot be resent")
    expect(store.markMessageFailed).toHaveBeenLastCalledWith(
      "msg-1",
      undefined,
      "(#10) permission denied",
    )
    const held = failSendSubmit(
      markSendSubmitted(
        enqueueSend(createSendQueue<unknown>(), { clientId: "c-1", input: {} }),
        "c-1",
        0,
      ),
      "c-1",
    )
    const tracked = markResendSubmitted(
      held,
      { messageId: "msg-1", clientId: "c-1" },
      0,
    )
    const [restore] = store.updateAllSendQueues.mock.calls.at(-1) as [
      (queue: SendQueue<unknown>) => SendQueue<unknown>,
    ]
    expect(restore(tracked).inFlight).toBeNull()
    expect(restore(tracked).holdReason).toBe("failed")
  })

  test("a queue held for this message in ANOTHER conversation (a private reply) is unlocked too, an unrelated one is left alone", async () => {
    resendAction.mockResolvedValue({ data: { id: "msg-1", queued: true } })
    await press(render())

    const [track] = store.updateAllSendQueues.mock.calls[0] as [
      (queue: SendQueue<unknown>) => SendQueue<unknown>,
    ]
    const held = failSendSubmit(
      markSendSubmitted(
        enqueueSend(createSendQueue<unknown>(), {
          clientId: "c-1",
          input: {},
        }),
        "c-1",
        0,
      ),
      "c-1",
    )
    // Held for a submit refused by clientId only; the row's clientId matches.
    expect(track(held).holdReason).toBeNull()
    const unrelated = createSendQueue<unknown>()
    expect(track(unrelated)).toBe(unrelated)
  })

  test("a thrown error falls back to its message, then to the generic one", async () => {
    resendAction.mockRejectedValue(new Error("network down"))
    await press(render())
    expect(toast.error).toHaveBeenCalledWith("network down")

    resendAction.mockRejectedValue("boom")
    await press(container as HTMLElement)
    expect(toast.error).toHaveBeenLastCalledWith("messages.unknownError")
  })
})
