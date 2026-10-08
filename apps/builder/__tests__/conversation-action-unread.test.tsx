import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

type UnreadResult =
  | { data?: { agentLastReadAt: string | null }; serverError?: string }
  | undefined
const executeAsyncMock = vi.hoisted(() => vi.fn<() => Promise<UnreadResult>>())
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: executeAsyncMock, isExecuting: false }),
}))

vi.mock("@/features/conversations/actions/unread-conversation.action", () => ({
  unreadConversationAction: { bind: () => "unread" },
}))

const toastMock = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMock }))

const conversationIdParamMock = vi.hoisted(() => ({ clear: vi.fn() }))
vi.mock("@/features/conversations/hooks/use-conversation-id-param", () => ({
  useConversationIdParam: () => conversationIdParamMock,
}))

const storeState = {
  activeConversationId: null as string | null,
  setActiveConversationId: vi.fn(),
  markManuallyUnread: vi.fn(),
  clearManuallyUnread: vi.fn(),
  applyUnreadResult: vi.fn(),
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

const { useMarkConversationUnread } = await import(
  "@/features/conversations/hooks/use-mark-conversation-unread"
)
const { inFlightReadByConversationId, waitForPendingUnread } = await import(
  "@/features/conversations/lib/pending-reads"
)

let markAsUnread: () => Promise<void> = () => Promise.resolve()

const Harness = () => {
  markAsUnread = useMarkConversationUnread("conversation-1").markAsUnread
  return null
}

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const isSettled = async (promise: Promise<unknown>) => {
  const settled = vi.fn()
  promise.then(settled, settled)
  await Promise.resolve()
  await Promise.resolve()
  return settled.mock.calls.length > 0
}

describe("useMarkConversationUnread", () => {
  let container: HTMLDivElement
  let root: Root
  // The store mock is not reactive, so a test that changes it re-renders.
  const renderHarness = () => {
    act(() => {
      root.render(<Harness />)
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    storeState.activeConversationId = null
    inFlightReadByConversationId.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    renderHarness()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("pins the conversation unread before writing and mirrors the server cursor", async () => {
    executeAsyncMock.mockResolvedValue({
      data: { agentLastReadAt: "2025-12-31T00:00:00.000Z" },
    })

    const write = markAsUnread()
    expect(storeState.markManuallyUnread).toHaveBeenCalledWith("conversation-1")
    await write

    expect(executeAsyncMock).toHaveBeenCalledTimes(1)
    expect(storeState.applyUnreadResult).toHaveBeenCalledWith(
      "conversation-1",
      new Date("2025-12-31T00:00:00.000Z"),
    )
    expect(storeState.clearManuallyUnread).not.toHaveBeenCalled()
  })

  // A conversation with a single incoming message is marked unread by
  // clearing the cursor. Turning that null into "now" would show it as read
  // locally while the database says unread.
  test("keeps a null read cursor as null instead of stamping the current time", async () => {
    executeAsyncMock.mockResolvedValue({ data: { agentLastReadAt: null } })

    await markAsUnread()

    expect(storeState.applyUnreadResult).toHaveBeenCalledWith(
      "conversation-1",
      null,
    )
  })

  test("drops the pin and shows the error when the server rejects the write", async () => {
    executeAsyncMock.mockResolvedValue({ serverError: "nope" })

    await markAsUnread()

    expect(storeState.clearManuallyUnread).toHaveBeenCalledWith(
      "conversation-1",
    )
    expect(toastMock.error).toHaveBeenCalledWith("nope")
    expect(storeState.applyUnreadResult).not.toHaveBeenCalled()
  })

  test("drops the pin silently on a transport failure", async () => {
    executeAsyncMock.mockRejectedValue(new Error("offline"))

    await markAsUnread()

    expect(storeState.clearManuallyUnread).toHaveBeenCalledWith(
      "conversation-1",
    )
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  // The menu lives in a virtualized row that may unmount before the server
  // answers; the outcome must not depend on it, so it is settled in the
  // promise chain rather than in the hook's React callbacks.
  test("still applies the outcome after the owning component unmounted", async () => {
    const result = deferred<UnreadResult>()
    executeAsyncMock.mockReturnValue(result.promise)

    const write = markAsUnread()
    act(() => root.unmount())
    root = createRoot(container)

    result.resolve({ data: { agentLastReadAt: null } })
    await write

    expect(storeState.applyUnreadResult).toHaveBeenCalledWith(
      "conversation-1",
      null,
    )
  })

  // Like Chatwoot: an open thread is by definition read, so marking it unread
  // closes it and lands on the empty state instead of leaving a bold row
  // open with its messages on screen.
  test("closes the thread when the open conversation is marked unread", async () => {
    storeState.activeConversationId = "conversation-1"
    renderHarness()
    executeAsyncMock.mockResolvedValue({ data: { agentLastReadAt: null } })

    const write = markAsUnread()

    expect(storeState.setActiveConversationId).toHaveBeenCalledWith(null)
    expect(conversationIdParamMock.clear).toHaveBeenCalledTimes(1)
    await write
  })

  test("pins before closing so the leave path cannot read the thread back", async () => {
    storeState.activeConversationId = "conversation-1"
    renderHarness()
    executeAsyncMock.mockResolvedValue({ data: { agentLastReadAt: null } })

    await markAsUnread()

    const pinOrder = storeState.markManuallyUnread.mock.invocationCallOrder[0]
    const closeOrder =
      storeState.setActiveConversationId.mock.invocationCallOrder[0]
    expect(pinOrder).toBeLessThan(closeOrder ?? 0)
  })

  test("leaves the selection alone when another conversation is marked unread", async () => {
    storeState.activeConversationId = "conversation-2"
    renderHarness()
    executeAsyncMock.mockResolvedValue({ data: { agentLastReadAt: null } })

    await markAsUnread()

    expect(storeState.setActiveConversationId).not.toHaveBeenCalled()
    expect(conversationIdParamMock.clear).not.toHaveBeenCalled()
  })

  test("waits for an in-flight read before writing", async () => {
    const read = deferred<void>()
    inFlightReadByConversationId.set("conversation-1", {
      request: read.promise,
      activityAt: null,
      behindUnread: undefined,
    })
    executeAsyncMock.mockResolvedValue({ data: { agentLastReadAt: null } })

    const write = markAsUnread()
    await Promise.resolve()
    expect(executeAsyncMock).not.toHaveBeenCalled()

    read.resolve()
    await write
    expect(executeAsyncMock).toHaveBeenCalledTimes(1)
  })

  test("registers the write so reads issued meanwhile queue behind it", async () => {
    const result = deferred<UnreadResult>()
    executeAsyncMock.mockReturnValue(result.promise)

    const write = markAsUnread()
    expect(await isSettled(waitForPendingUnread("conversation-1"))).toBe(false)

    result.resolve({ data: { agentLastReadAt: null } })
    await write
    expect(await isSettled(waitForPendingUnread("conversation-1"))).toBe(true)
  })
})
