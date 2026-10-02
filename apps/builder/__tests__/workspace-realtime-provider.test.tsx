import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { resetRealtimeWarnLimiterForTests } from "@/features/realtime/realtime-warn-limiter"

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

const { invalidateQueriesMock } = vi.hoisted(() => ({
  invalidateQueriesMock: vi.fn(),
}))
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}))

vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({
    publicRealtimeUrl: "ws://realtime.test",
  }),
}))

const mintWorkspaceToken = vi.fn().mockResolvedValue({ token: "token-1" })
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    realtimeAPI: {
      mintWorkspaceConnectTokenAuthenticatedAPI: mintWorkspaceToken,
    },
  },
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
  readyState = 0
  sent: string[] = []
  url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3
    this.onclose?.({ code: code ?? 1000, reason: reason ?? "" })
  }

  open(): void {
    this.readyState = 1
    this.onopen?.()
  }

  receive(data: string): void {
    this.onmessage?.({ data })
  }

  send(data: string): void {
    this.sent.push(data)
  }
}

// Dynamic imports ensure the browser-facing module observes the mocked routing,
// tenant, RPC, and logger dependencies registered above.
const { WorkspaceRealtimeProvider, useWorkspaceRealtimeContext } = await import(
  "@/features/realtime/workspace-realtime-provider"
)
const { useWorkspaceRealtimeEvents } = await import(
  "@/features/realtime/use-workspace-realtime-events"
)

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

describe("WorkspaceRealtimeProvider", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal("WebSocket", FakeWebSocket)
    FakeWebSocket.instances = []
    mintWorkspaceToken.mockClear()
    loggerMock.warn.mockClear()
    resetRealtimeWarnLimiterForTests()
    localStorage.clear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  const render = async (children: ReactNode): Promise<void> => {
    await act(() => {
      root.render(
        <WorkspaceRealtimeProvider>{children}</WorkspaceRealtimeProvider>,
      )
    })
  }

  test("mints a fresh member token URL for the native WebSocket", async () => {
    await render(null)
    const socket = await waitForSocket()

    expect(mintWorkspaceToken).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
    expect(socket.url).toBe(
      "ws://realtime.test/rt/workspaces/workspace-1?token=token-1",
    )
  })

  test("dispatches each valid gateway batch event to its subscribers", async () => {
    const messageDeleted = vi.fn()
    const contactBlocked = vi.fn()
    function Subscriber() {
      useWorkspaceRealtimeEvents({ contactBlocked, messageDeleted })
      return null
    }

    await render(<Subscriber />)
    const socket = await waitForSocket()

    act(() => {
      socket.receive(
        JSON.stringify({
          seq: "1-0",
          batch: [
            { eventType: "messageDeleted", data: { messageIds: ["m1"] } },
            { eventType: "contactBlocked", data: { contactId: "c1" } },
          ],
        }),
      )
    })

    expect(messageDeleted).toHaveBeenCalledWith({
      eventType: "messageDeleted",
      data: { messageIds: ["m1"] },
    })
    expect(contactBlocked).toHaveBeenCalledWith({
      eventType: "contactBlocked",
      data: { contactId: "c1" },
    })
  })
  test("keeps the replay cursor per provider instance", async () => {
    vi.useFakeTimers()
    try {
      await render(null)
      const firstSocket = await waitForSocket()

      act(() => {
        firstSocket.receive(
          JSON.stringify({
            batch: [
              { data: { messageIds: ["m1"] }, eventType: "messageDeleted" },
            ],
            seq: "9-0",
          }),
        )
      })
      await act(async () => {
        firstSocket.close()
        await vi.runAllTimersAsync()
      })

      const reconnectSocket = await waitForSocket()
      expect(reconnectSocket.url).toContain("lastSeq=9-0")

      await act(() => root.unmount())
      root = createRoot(container)
      await render(null)

      const freshProviderSocket = await waitForSocket()
      expect(freshProviderSocket.url).not.toContain("lastSeq=")
    } finally {
      vi.useRealTimers()
    }
  })
  test("defers the resync count bump until the reconnect opens, not the close", async () => {
    // Regression for PR #1349 finding #2: bumping `resyncCount` (which
    // drives a full `invalidateQueries()`) at close time, before the new
    // socket is live, lets an event land in the gap between the stale
    // refetch and the new subscription with nothing to catch it.
    vi.useFakeTimers()
    try {
      const resyncCounts: number[] = []
      const statuses: string[] = []
      function StatusReader() {
        const { resyncCount, status } = useWorkspaceRealtimeContext()
        resyncCounts.push(resyncCount)
        statuses.push(status)
        return null
      }

      await render(<StatusReader />)
      const socket = await waitForSocket()
      act(() => socket.open())
      act(() => socket.close(4002, "resync"))

      expect(statuses.at(-1)).toBe("resyncing")
      expect(resyncCounts.at(-1)).toBe(0)

      await act(async () => {
        await vi.runAllTimersAsync()
      })
      const reconnectSocket = await waitForSocket()
      act(() => reconnectSocket.open())

      expect(statuses.at(-1)).toBe("open")
      expect(resyncCounts.at(-1)).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test("keeps malformed gateway frames out of subscribers", async () => {
    const handler = vi.fn()
    function Subscriber() {
      useWorkspaceRealtimeEvents({ messageDeleted: handler })
      return null
    }

    await render(<Subscriber />)
    const socket = await waitForSocket()
    act(() => socket.receive("not json"))

    expect(handler).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      expect.stringContaining("parse"),
    )
  })

  test("suppresses duplicate and stale stream batches during replay handoff", async () => {
    const handler = vi.fn()
    function Subscriber() {
      useWorkspaceRealtimeEvents({ messageDeleted: handler })
      return null
    }

    await render(<Subscriber />)
    const socket = await waitForSocket()
    const batch = JSON.stringify({
      seq: "2-0",
      batch: [{ eventType: "messageDeleted", data: { messageIds: ["m1"] } }],
    })

    act(() => {
      socket.receive(batch)
      socket.receive(batch)
      socket.receive(
        JSON.stringify({
          seq: "1-0",
          batch: [
            { eventType: "messageDeleted", data: { messageIds: ["stale"] } },
          ],
        }),
      )
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({
      eventType: "messageDeleted",
      data: { messageIds: ["m1"] },
    })
  })

  test("silently ignores unknown event names and isolates throwing listeners", async () => {
    const throwingHandler = vi.fn(() => {
      throw new Error("listener failure")
    })
    const healthyHandler = vi.fn()
    function ThrowingSubscriber() {
      useWorkspaceRealtimeEvents({ messageDeleted: throwingHandler })
      return null
    }
    function HealthySubscriber() {
      useWorkspaceRealtimeEvents({ messageDeleted: healthyHandler })
      return null
    }

    await render(
      <>
        <ThrowingSubscriber />
        <HealthySubscriber />
      </>,
    )
    const socket = await waitForSocket()
    act(() => {
      socket.receive(
        JSON.stringify({
          batch: [
            { eventType: "futureEvent", data: {} },
            { eventType: "messageDeleted", data: { messageIds: ["m1"] } },
          ],
          seq: "3-0",
        }),
      )
    })

    expect(throwingHandler).toHaveBeenCalledTimes(1)
    expect(healthyHandler).toHaveBeenCalledTimes(1)
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "messageDeleted" }),
      expect.stringContaining("listener threw"),
    )
  })

  test("does not dispatch schema-invalid event data", async () => {
    const handler = vi.fn()
    function Subscriber() {
      useWorkspaceRealtimeEvents({ whatsappCallTransportIncoming: handler })
      return null
    }

    await render(<Subscriber />)
    const socket = await waitForSocket()
    act(() => {
      socket.receive(
        JSON.stringify({
          batch: [{ eventType: "whatsappCallTransportIncoming", data: {} }],
          seq: "4-0",
        }),
      )
    })

    expect(handler).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "whatsappCallTransportIncoming",
      }),
      expect.stringContaining("schema validation"),
    )
  })
})
