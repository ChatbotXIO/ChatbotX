import { act, StrictMode, useContext } from "react"
import type { Root } from "react-dom/client"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { ChatStoreApi } from "@/features/chat/store/chat-store-provider"
import {
  ChatStoreContext,
  ChatStoreProvider,
} from "@/features/chat/store/chat-store-provider"

const StoreCapture = ({
  onStore,
}: {
  onStore: (store: ChatStoreApi) => void
}) => {
  const store = useContext(ChatStoreContext)
  if (!store) {
    throw new Error("Chat store is unavailable")
  }

  onStore(store)
  return (
    <span data-active-conversation-id={store.getState().activeConversationId} />
  )
}

describe("ChatStoreProvider", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("applies initial state only once across StrictMode's double render", () => {
    const capturedStores: ChatStoreApi[] = []

    act(() => {
      root.render(
        <StrictMode>
          <ChatStoreProvider
            initialState={{ activeConversationId: "conv-seeded" }}
          >
            <StoreCapture onStore={(store) => capturedStores.push(store)} />
          </ChatStoreProvider>
        </StrictMode>,
      )
    })

    expect(capturedStores.length).toBeGreaterThan(0)
    expect(capturedStores.every((store) => store === capturedStores[0])).toBe(
      true,
    )
    expect(capturedStores[0]?.getState().activeConversationId).toBe(
      "conv-seeded",
    )
  })

  test("preserves the existing store when rerendered with a different initial state", () => {
    const capturedStores: ChatStoreApi[] = []

    act(() => {
      root.render(
        <ChatStoreProvider
          initialState={{ activeConversationId: "conv-first" }}
        >
          <StoreCapture onStore={(store) => capturedStores.push(store)} />
        </ChatStoreProvider>,
      )
    })
    const initialStore = capturedStores.at(-1)

    act(() => {
      root.render(
        <ChatStoreProvider
          initialState={{ activeConversationId: "conv-second" }}
        >
          <StoreCapture onStore={(store) => capturedStores.push(store)} />
        </ChatStoreProvider>,
      )
    })

    expect(capturedStores.at(-1)).toBe(initialStore)
    expect(initialStore?.getState().activeConversationId).toBe("conv-first")
  })
})
