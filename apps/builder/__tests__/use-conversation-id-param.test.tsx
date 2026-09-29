// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { useConversationIdParam } from "@/features/conversations/hooks/use-conversation-id-param"

const navigation = vi.hoisted(() => ({
  pathname: "/space/ws-1/inbox",
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}))

const ConversationIdControls = () => {
  const { clear, set } = useConversationIdParam()

  return (
    <>
      <button onClick={() => set("conversation-2")} type="button">
        Set conversation
      </button>
      <button onClick={clear} type="button">
        Clear conversation
      </button>
    </>
  )
}

describe("useConversationIdParam", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    navigation.replace.mockClear()
    navigation.searchParams = new URLSearchParams("filter=unread")
    window.history.replaceState(null, "", "/space/ws-1/inbox?filter=unread")
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)

    act(() => {
      root.render(<ConversationIdControls />)
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("sets the conversation id without routing", () => {
    act(() => {
      container.querySelector("button")?.click()
    })

    expect(window.location.search).toBe(
      "?filter=unread&conversationId=conversation-2",
    )
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  test("clears the conversation id without routing", () => {
    navigation.searchParams = new URLSearchParams(
      "filter=unread&conversationId=conversation-2",
    )
    window.history.replaceState(
      null,
      "",
      "/space/ws-1/inbox?filter=unread&conversationId=conversation-2",
    )

    act(() => {
      root.render(<ConversationIdControls />)
    })

    act(() => {
      container.querySelectorAll("button")[1]?.click()
    })

    expect(window.location.search).toBe("?filter=unread")
    expect(navigation.replace).not.toHaveBeenCalled()
  })
})
