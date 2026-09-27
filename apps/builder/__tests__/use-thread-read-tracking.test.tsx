import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const markConversationReadMock = vi.fn()
vi.mock("@/features/conversations/hooks/use-mark-conversation-read", () => ({
  useMarkConversationRead: () => markConversationReadMock,
}))

const { useThreadReadTracking } = await import(
  "@/features/conversations/hooks/use-thread-read-tracking"
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

  test.each([
    ["click", new MouseEvent("click", { bubbles: true })],
    ["focus", new FocusEvent("focusin", { bubbles: true })],
    ["scroll", new Event("scroll", { bubbles: false })],
    ["wheel", new WheelEvent("wheel", { bubbles: true })],
  ])("marks an unread thread read on %s inside it", (_, event) => {
    render(unread())

    fire(event)

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
    expect(markConversationReadMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "conversation-1" }),
    )
  })

  test("ignores pointer movement", () => {
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
    render(unread("conversation-1"))
    expect(markConversationReadMock).not.toHaveBeenCalled()

    render(unread("conversation-2"))

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

    render(unread("conversation-2"))

    expect(markConversationReadMock).not.toHaveBeenCalled()
  })

  test("marks an unread thread read when it unmounts", () => {
    render(unread())

    act(() => {
      root.unmount()
    })
    root = createRoot(container)

    expect(markConversationReadMock).toHaveBeenCalledTimes(1)
  })
})
