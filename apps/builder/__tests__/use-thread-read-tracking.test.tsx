import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const markConversationReadMock = vi.fn()
vi.mock("@/features/conversations/hooks/use-mark-conversation-read", () => ({
  useMarkConversationRead: () => markConversationReadMock,
}))

const storeState = {
  manuallyUnreadConversationIds: new Set<string>() as ReadonlySet<string>,
  openRequestNonce: 0,
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

const { useThreadReadTracking } = await import(
  "@/features/conversations/hooks/use-thread-read-tracking"
)
const { registerPendingUnread } = await import(
  "@/features/conversations/lib/pending-reads"
)

type Tracked = NonNullable<Parameters<typeof useThreadReadTracking>[0]>

const unread = (id = "conversation-1"): Tracked => ({
  id,
  workspaceId: "workspace-1",
  lastActivityAt: new Date("2026-09-24T10:00:00Z"),
  agentLastReadAt: new Date("2026-09-24T09:00:00Z"),
})

const read = (id = "conversation-1"): Tracked => ({
  ...unread(id),
  agentLastReadAt: new Date("2026-09-24T11:00:00Z"),
})

const Thread = ({ conversation }: { conversation: Tracked | null }) => {
  const handlers = useThreadReadTracking(conversation)
  return (
    <div data-testid="thread" {...handlers}>
      <textarea />
    </div>
  )
}

describe("useThreadReadTracking", () => {
  let container: HTMLDivElement
  let root: Root

  const render = (conversation: Tracked | null) => {
    act(() => {
      root.render(<Thread conversation={conversation} />)
    })
  }
  const thread = () => {
    const element = container.querySelector<HTMLElement>(
      "[data-testid='thread']",
    )
    if (!element) {
      throw new Error("thread not rendered")
    }
    return element
  }
  const fire = (event: Event) => {
    act(() => {
      thread().firstElementChild?.dispatchEvent(event)
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    storeState.manuallyUnreadConversationIds = new Set()
    storeState.openRequestNonce = 0
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
  })

  // Opening is the read that used to live in the row's active effect; it is
  // here so the mobile layout (which unmounts the row on select) reads too.
  test("marks an unread conversation read when it opens", () => {
    render(unread())

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
    expect(markConversationReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
    )
  })

  test("does not read an already-read conversation when it opens", () => {
    render(read())

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  test("does not read again when a message arrives in the open thread", () => {
    render(read())

    render(unread())

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  test("does not read a manually marked unread conversation when it opens", () => {
    storeState.manuallyUnreadConversationIds = new Set(["conversation-1"])

    render(unread())

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  test.each([
    ["click", new MouseEvent("click", { bubbles: true })],
    ["focus", new FocusEvent("focusin", { bubbles: true })],
    ["wheel", new WheelEvent("wheel", { bubbles: true })],
    ["touchmove", new Event("touchmove", { bubbles: true })],
    ["pointerdown", new Event("pointerdown", { bubbles: true })],
  ])("marks an unread thread read on %s inside it", (_, event) => {
    render(read())
    // A customer message arrives while the thread is open.
    render(unread())

    fire(event)

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
    expect(markConversationReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
    )
  })

  // The message list follows new output: a customer message makes it scroll
  // to the bottom on its own, and that scroll event is not the agent reading.
  test("ignores a scroll the agent did not make", () => {
    render(read())
    render(unread())

    fire(new Event("scroll", { bubbles: false }))

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  test("ignores pointer movement", () => {
    render(read())
    render(unread())

    fire(new MouseEvent("mousemove", { bubbles: true }))
    fire(new MouseEvent("mouseover", { bubbles: true }))

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  test("does nothing when the thread is already read", () => {
    render(read())

    fire(new MouseEvent("click", { bubbles: true }))

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  test("marks the conversation being left read when switching to another", () => {
    render(read("conversation-1"))
    render(unread("conversation-1"))
    expect(markConversationReadMock).not.toHaveBeenCalled()

    render(read("conversation-2"))

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
    expect(markConversationReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
    )
  })

  test("uses the latest snapshot of the conversation being left", () => {
    render(read("conversation-1"))
    // A customer message arrives while the thread is open.
    render(unread("conversation-1"))

    render(null)

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
    expect(markConversationReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
    )
  })

  test("leaves a read conversation alone when switching away", () => {
    render(read("conversation-1"))

    render(read("conversation-2"))

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  test("marks an unread thread read when it unmounts", () => {
    render(read())
    render(unread())

    act(() => {
      root.unmount()
    })
    root = createRoot(container)

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
  })

  // "Mark as Unread" then clicking another row used to read the first one
  // straight back through this leave path.
  test("does not read a manually marked unread conversation when leaving it", () => {
    render(read("conversation-1"))
    storeState.manuallyUnreadConversationIds = new Set(["conversation-1"])
    render(unread("conversation-1"))

    render(read("conversation-2"))

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  test("does not read a manually marked unread thread on interaction inside it", () => {
    storeState.manuallyUnreadConversationIds = new Set(["conversation-1"])
    render(unread("conversation-1"))

    fire(new MouseEvent("click", { bubbles: true }))
    fire(new WheelEvent("wheel", { bubbles: true }))

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  // "Mark as Unread" on the open thread pins it and closes it in the same
  // click, so this leave runs before the pin is visible to the hook. The
  // write is registered synchronously, and that is what stands in for it.
  test("does not read the conversation being left while its unread write is pending", async () => {
    render(unread("conversation-1"))
    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
    let finishWrite: () => void = () => undefined
    const write = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    registerPendingUnread("conversation-1", write)

    render(null)
    // Settle the fake write first so a failure here cannot leak a pending
    // entry into the tests that follow.
    finishWrite()
    await write

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
  })

  test("reads again once the manual mark is cleared", () => {
    storeState.manuallyUnreadConversationIds = new Set(["conversation-1"])
    render(unread("conversation-1"))
    storeState.manuallyUnreadConversationIds = new Set()
    render(unread("conversation-1"))

    fire(new MouseEvent("click", { bubbles: true }))

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
  })

  // The call panel navigating to the thread that is already open bumps the
  // store's open request; that counts as opening it again.
  test("reads the open thread again when an open is requested for it", () => {
    render(read())
    render(unread())
    expect(markConversationReadMock).not.toHaveBeenCalled()

    storeState.openRequestNonce += 1
    render(unread())

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
  })

  // Reopening while "Mark as Unread" is still being written: the local
  // cursor still says read, but the write will land, so the reopen must
  // issue the read that goes behind it.
  test("treats a pending unread write as unread when the thread is opened again", async () => {
    render(read())
    let finishWrite: () => void = () => undefined
    const write = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    registerPendingUnread("conversation-1", write)

    storeState.openRequestNonce += 1
    render(read())
    finishWrite()
    await write

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
  })

  test("still reads a different unread conversation being left", () => {
    storeState.manuallyUnreadConversationIds = new Set(["conversation-2"])
    render(read("conversation-1"))
    render(unread("conversation-1"))

    render(unread("conversation-2"))

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
    expect(markConversationReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
    )
  })
})
