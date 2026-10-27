import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const sockets = vi.hoisted(() => [] as FakeRealtimeSocket[])

type FakeRealtimeSocket = {
  close: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  reconnectNow: ReturnType<typeof vi.fn>
}

vi.mock("@chatbotx.io/realtime-protocol", () => ({
  RealtimeSocket: class {
    close = vi.fn()
    connect = vi.fn()
    reconnectNow = vi.fn()
    constructor() {
      sockets.push(this)
    }
  },
}))

import { useRealtimeSocket } from "@/features/realtime/use-realtime-socket"

const SocketHost = ({ connectionKey }: { connectionKey: string }) => {
  useRealtimeSocket({
    connectionKey,
    getUrl: () => Promise.resolve("ws://realtime.test"),
    onMessage: vi.fn(),
  })
  return null
}

const mountedRoots: Root[] = []

const renderSocket = (connectionKey = "workspace-1") => {
  const root = createRoot(document.createElement("div"))
  mountedRoots.push(root)
  act(() => {
    root.render(<SocketHost connectionKey={connectionKey} />)
  })
  return { unmount: () => act(() => root.unmount()) }
}

const setVisibility = (state: DocumentVisibilityState): void => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  })
  document.dispatchEvent(new Event("visibilitychange"))
}

beforeEach(() => {
  sockets.length = 0
})

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount())
  }
  setVisibility("visible")
})

test("retries at once when the browser comes back online", () => {
  renderSocket()

  window.dispatchEvent(new Event("online"))

  expect(sockets[0]?.reconnectNow).toHaveBeenCalledOnce()
})

test("retries at once when the tab becomes visible, not when it is hidden", () => {
  renderSocket()

  setVisibility("hidden")
  expect(sockets[0]?.reconnectNow).not.toHaveBeenCalled()

  setVisibility("visible")
  expect(sockets[0]?.reconnectNow).toHaveBeenCalledOnce()
})

test("stops listening once the socket is torn down", () => {
  const { unmount } = renderSocket()

  unmount()
  window.dispatchEvent(new Event("online"))
  setVisibility("visible")

  expect(sockets[0]?.close).toHaveBeenCalledOnce()
  expect(sockets[0]?.reconnectNow).not.toHaveBeenCalled()
})

test("does not open a socket or listen without a connection key", () => {
  renderSocket("")

  window.dispatchEvent(new Event("online"))

  expect(sockets).toHaveLength(0)
})
