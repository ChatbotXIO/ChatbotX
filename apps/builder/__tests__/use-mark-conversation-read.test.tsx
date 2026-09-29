import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type ReadResult =
  | { serverError?: string; data?: { agentLastReadAt: string } }
  | undefined

const readConversationActionMock = vi.hoisted(() =>
  vi.fn<() => Promise<ReadResult>>(),
)
vi.mock("@/features/conversations/actions/read-conversation.action", () => ({
  readConversationAction: readConversationActionMock,
}))

const toastMock = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock("sonner", () => ({ toast: toastMock }))

const storeState = { applyAgentLastReadAt: vi.fn() }
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

const { useMarkConversationRead } = await import(
  "@/features/conversations/hooks/use-mark-conversation-read"
)

const target = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  lastActivityAt: new Date("2026-09-24T09:00:00.000Z"),
}
const persistedAt = "2026-09-24T10:00:00.000Z"

// Two hook instances, as the active row and the thread pane own one each.
let markReadFromRow: ReturnType<typeof useMarkConversationRead>
let markReadFromPane: ReturnType<typeof useMarkConversationRead>

const Row = () => {
  markReadFromRow = useMarkConversationRead()
  return null
}
const Pane = () => {
  markReadFromPane = useMarkConversationRead()
  return null
}

const deferred = () => {
  let resolve: (value: ReadResult) => void = () => undefined
  const promise = new Promise<ReadResult>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe("useMarkConversationRead", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    readConversationActionMock.mockResolvedValue({
      data: { agentLastReadAt: persistedAt },
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <>
          <Row />
          <Pane />
        </>,
      )
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("calls the action with the workspace and conversation, then mirrors the persisted timestamp", async () => {
    await markReadFromRow(target)

    expect(readConversationActionMock).toHaveBeenCalledWith(
      "workspace-1",
      "conversation-1",
    )
    expect(storeState.applyAgentLastReadAt).toHaveBeenCalledWith(
      ["conversation-1"],
      new Date(persistedAt),
    )
  })

  test("surfaces a server error as a toast and leaves the store untouched", async () => {
    readConversationActionMock.mockResolvedValue({ serverError: "boom" })

    await markReadFromRow(target)

    expect(toastMock.error).toHaveBeenCalledWith("boom")
    expect(storeState.applyAgentLastReadAt).not.toHaveBeenCalled()
  })

  test("swallows a transport failure without touching the store", async () => {
    readConversationActionMock.mockRejectedValue(new Error("offline"))

    await expect(markReadFromRow(target)).resolves.toBeUndefined()

    expect(toastMock.error).not.toHaveBeenCalled()
    expect(storeState.applyAgentLastReadAt).not.toHaveBeenCalled()
  })

  test("shares one in-flight request per conversation across hook instances", async () => {
    const first = deferred()
    readConversationActionMock.mockReturnValueOnce(first.promise)

    const fromRow = markReadFromRow(target)
    const fromPane = markReadFromPane(target)
    expect(readConversationActionMock).toHaveBeenCalledTimes(1)
    expect(fromPane).toBe(fromRow)

    first.resolve({ data: { agentLastReadAt: persistedAt } })
    await fromRow

    await markReadFromPane(target)
    expect(readConversationActionMock).toHaveBeenCalledTimes(2)
  })

  // A read request carries the server time it was issued at. A customer
  // message that lands while it is in flight is newer than that time, so a
  // second interaction must produce one more read after the first settles —
  // not silently reuse the stale request.
  test("queues one trailing read when newer activity arrives during an in-flight request", async () => {
    const first = deferred()
    readConversationActionMock.mockReturnValueOnce(first.promise)
    const newerTarget = {
      ...target,
      lastActivityAt: new Date("2026-09-24T09:00:05.000Z"),
    }

    const initial = markReadFromPane(target)
    const trailing = markReadFromPane(newerTarget)
    const trailingAgain = markReadFromRow(newerTarget)
    expect(readConversationActionMock).toHaveBeenCalledTimes(1)
    expect(trailingAgain).toBe(trailing)

    first.resolve({ data: { agentLastReadAt: persistedAt } })
    await initial
    await trailing
    expect(readConversationActionMock).toHaveBeenCalledTimes(2)

    await markReadFromRow(newerTarget)
    expect(readConversationActionMock).toHaveBeenCalledTimes(3)
  })

  test("keeps different conversations independent", async () => {
    const first = deferred()
    readConversationActionMock.mockReturnValueOnce(first.promise)

    const pending = markReadFromRow(target)
    await markReadFromPane({ ...target, id: "conversation-2" })

    expect(readConversationActionMock).toHaveBeenCalledTimes(2)
    expect(storeState.applyAgentLastReadAt).toHaveBeenCalledWith(
      ["conversation-2"],
      new Date(persistedAt),
    )

    first.resolve({ data: { agentLastReadAt: persistedAt } })
    await pending
  })
})
