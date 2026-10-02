// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ publicRealtimeUrl: "ws://realtime.test" }),
}))

const loggerMock = { warn: vi.fn() }
vi.mock("@/lib/log", () => ({ logger: loggerMock }))

type FakeCloseEvent = { code: number; reason: string }

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  onclose: ((event: FakeCloseEvent) => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onopen: (() => void) | null = null
  url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  close(code?: number, reason?: string): void {
    this.onclose?.({ code: code ?? 1000, reason: reason ?? "" })
  }

  open(): void {
    this.onopen?.()
  }
}

const { WebchatRealtime } = await import(
  "@/features/integration-webchat/webchat-realtime"
)
const { GuestSessionStoreProvider, useGuestSessionStore } = await import(
  "@/features/integration-webchat/providers/store/guest-session-provider"
)

const webchatConfig = {
  id: "webchat-1",
  workspaceId: "ws-1",
  name: "Widget",
  brandColor: "#000000",
  hideHeader: false,
  showLogo: true,
  hideMessageInput: false,
  welcomeFlowId: null,
  persistentMenus: [],
}

function ConnectionStatusReader({
  onStatus,
}: {
  onStatus: (status: string) => void
}) {
  const connectionStatus = useGuestSessionStore(
    (state) => state.connectionStatus,
  )
  onStatus(connectionStatus)
  return null
}

const waitForSocket = async (): Promise<FakeWebSocket> => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  const socket = FakeWebSocket.instances.at(-1)
  if (!socket) {
    throw new Error("Expected a native WebSocket connection")
  }
  return socket
}

describe("WebchatRealtime connection status", () => {
  let container: HTMLDivElement
  let root: Root
  let statuses: string[]

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.stubGlobal("WebSocket", FakeWebSocket)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ token: "tok-1" }),
        ok: true,
        status: 200,
      }),
    )
    FakeWebSocket.instances = []
    loggerMock.warn.mockClear()
    statuses = []
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const render = async (): Promise<void> => {
    await act(() => {
      root.render(
        <GuestSessionStoreProvider
          accessToken="guest-token"
          config={webchatConfig}
          serverGuestConversationId="guest-1"
        >
          <WebchatRealtime guestConversationId="guest-1" />
          <ConnectionStatusReader
            onStatus={(status) => {
              statuses.push(status)
            }}
          />
        </GuestSessionStoreProvider>,
      )
    })
  }

  test("flips to closed after enough consecutive non-fatal close cycles, instead of staying connecting forever", async () => {
    // Regression for PR #1349 finding #9: a sustained, non-fatal outage
    // (not a 401/403 token-mint rejection) used to leave the status stuck on
    // "connecting" through every retry, with no signal to the guest that
    // anything was wrong.
    vi.useFakeTimers()
    try {
      await render()

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const socket = await waitForSocket()
        act(() => socket.close(1006, "abnormal closure"))
        await act(async () => {
          await vi.runAllTimersAsync()
        })
      }

      expect(statuses.at(-1)).toBe("closed")
    } finally {
      vi.useRealTimers()
    }
  })

  test("recovers to open once a reconnect succeeds after flipping to closed", async () => {
    vi.useFakeTimers()
    try {
      await render()

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const socket = await waitForSocket()
        act(() => socket.close(1006, "abnormal closure"))
        await act(async () => {
          await vi.runAllTimersAsync()
        })
      }
      expect(statuses.at(-1)).toBe("closed")

      const reconnectSocket = await waitForSocket()
      act(() => reconnectSocket.open())

      expect(statuses.at(-1)).toBe("open")
    } finally {
      vi.useRealTimers()
    }
  })

  test("stays connecting through occasional non-fatal closes under the threshold", async () => {
    await render()

    const first = await waitForSocket()
    act(() => first.close(1006, "abnormal closure"))

    expect(statuses.at(-1)).toBe("connecting")
  })
})
