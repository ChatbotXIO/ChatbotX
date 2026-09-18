import {
  PRESENCE_REPORT_INTERVAL_MS,
  serializePresencePingMessage,
} from "@chatbotx.io/partysocket-config/presence"
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { resetRealtimeWarnLimiterForTests } from "@/features/realtime/realtime-warn-limiter"

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "workspace-1",
}))

vi.mock("@/features/tenant", () => ({
  useTenantSettings: () => ({ wsUrl: "ws://localhost:1999" }),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    realtimeAPI: {
      mintWorkspaceConnectTokenAuthenticatedAPI: vi
        .fn()
        .mockResolvedValue({ token: "token-1" }),
    },
  },
}))

const loggerMock = { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock("@/lib/log", () => ({ logger: loggerMock }))

type CapturedPartySocketOptions = {
  onOpen?: () => void
  onClose?: () => void
  onMessage?: (event: { data: string }) => void
}
let captured: CapturedPartySocketOptions | null = null
const socketSendMock = vi.fn()
const usePartySocketMock = vi.fn((options: CapturedPartySocketOptions) => {
  captured = options
  return { send: socketSendMock }
})
vi.mock("partysocket/react", () => ({
  default: (options: CapturedPartySocketOptions) => usePartySocketMock(options),
}))

const { WorkspaceRealtimeProvider, useWorkspaceRealtimeContext } = await import(
  "@/features/realtime/workspace-realtime-provider"
)
const { useWorkspaceRealtimeEvents } = await import(
  "@/features/realtime/use-workspace-realtime-events"
)

function emit(eventType: string, data: unknown) {
  captured?.onMessage?.({ data: JSON.stringify({ eventType, data }) })
}

describe("WorkspaceRealtimeProvider", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    resetRealtimeWarnLimiterForTests()
    captured = null
    socketSendMock.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    captured = null
  })

  const render = (children: React.ReactNode) =>
    act(() => {
      root.render(
        <WorkspaceRealtimeProvider>{children}</WorkspaceRealtimeProvider>,
      )
    })

  test("dispatches an event once to a single subscriber", async () => {
    const handler = vi.fn()
    function Subscriber() {
      useWorkspaceRealtimeEvents({ messageDeleted: handler })
      return null
    }
    await render(<Subscriber />)

    act(() => {
      emit("messageDeleted", { messageIds: ["m1"] })
    })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({
      eventType: "messageDeleted",
      data: { messageIds: ["m1"] },
    })
  })

  test("dispatches to multiple subscribers of the same event", async () => {
    const first = vi.fn()
    const second = vi.fn()
    function Subscribers() {
      useWorkspaceRealtimeEvents({ messageDeleted: first })
      useWorkspaceRealtimeEvents({ messageDeleted: second })
      return null
    }
    await render(<Subscribers />)

    act(() => {
      emit("messageDeleted", { messageIds: ["m1"] })
    })

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  test("unregisters the handler on unmount", async () => {
    const handler = vi.fn()
    function Subscriber() {
      useWorkspaceRealtimeEvents({ messageDeleted: handler })
      return null
    }
    await render(<Subscriber />)
    act(() => root.unmount())

    emit("messageDeleted", { messageIds: ["m1"] })

    expect(handler).not.toHaveBeenCalled()
  })

  test("a handler identity change across renders keeps dispatching to the latest handler without re-subscribing", async () => {
    const first = vi.fn()
    const second = vi.fn()
    function Subscriber({ handler }: { handler: () => void }) {
      useWorkspaceRealtimeEvents({ messageDeleted: handler })
      return null
    }
    const statuses: { status: string; reconnectCount: number }[] = []
    function StatusReader() {
      const { status, reconnectCount } = useWorkspaceRealtimeContext()
      statuses.push({ status, reconnectCount })
      return null
    }
    await render(
      <>
        <StatusReader />
        <Subscriber handler={first} />
      </>,
    )
    act(() => {
      captured?.onOpen?.()
    })
    const reconnectCountBefore = statuses.at(-1)?.reconnectCount
    const statusBefore = statuses.at(-1)?.status

    await act(() => {
      root.render(
        <WorkspaceRealtimeProvider>
          <StatusReader />
          <Subscriber handler={second} />
        </WorkspaceRealtimeProvider>,
      )
    })

    // The socket connection's own lifecycle is untouched by a
    // handler-identity change: no new `onOpen`/`onClose` ever fires for
    // it, so `reconnectCount` cannot have incremented and `status` stays
    // exactly what it was. (`usePartySocket` itself IS called again here —
    // it is a hook, called on every render like any other; that is
    // unrelated to whether the underlying connection reconnects, which is
    // owned by its own internal effect, not by how many times the hook
    // function runs.)
    expect(statuses.at(-1)?.reconnectCount).toBe(reconnectCountBefore)
    expect(statuses.at(-1)?.status).toBe(statusBefore)

    act(() => {
      emit("messageDeleted", { messageIds: ["m1"] })
    })

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)

    // Only ONE listener is active for this event — a leftover registration
    // for `first` (never unsubscribed) would have made this two.
    act(() => {
      emit("messageDeleted", { messageIds: ["m2"] })
    })
    expect(second).toHaveBeenCalledTimes(2)
  })

  test("logs and drops a malformed JSON frame", async () => {
    await render(null)

    act(() => {
      captured?.onMessage?.({ data: "not json" })
    })

    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      expect.stringContaining("parse"),
    )
  })

  test("logs and does not dispatch an event that fails schema validation", async () => {
    const handler = vi.fn()
    function Subscriber() {
      useWorkspaceRealtimeEvents({ whatsappCallTransportIncoming: handler })
      return null
    }
    await render(<Subscriber />)

    act(() => {
      // Missing every required field of realtimeCallTransportIncomingSchema.
      emit("whatsappCallTransportIncoming", { bogus: true })
    })

    expect(handler).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "whatsappCallTransportIncoming" }),
      expect.stringContaining("schema"),
    )
  })

  test("dispatches an event that passes schema validation", async () => {
    const handler = vi.fn()
    function Subscriber() {
      useWorkspaceRealtimeEvents({ whatsappCallClaimedElsewhere: handler })
      return null
    }
    await render(<Subscriber />)

    act(() => {
      emit("whatsappCallClaimedElsewhere", {
        whatsappCallId: "call-1",
        wacid: "wacid-1",
        answeredByUserId: "user-1",
      })
    })

    expect(handler).toHaveBeenCalledTimes(1)
  })

  test("an event nobody subscribed to is ignored without logging", async () => {
    await render(null)

    act(() => {
      emit("conversationCreated", { some: "thing" })
    })

    expect(loggerMock.warn).not.toHaveBeenCalled()
  })

  test("an eventType unknown to this build is ignored without throwing", async () => {
    await render(null)

    expect(() => {
      act(() => {
        emit("someFutureEvent", { anything: true })
      })
    }).not.toThrow()
    expect(loggerMock.warn).not.toHaveBeenCalled()
  })

  test("reconnectCount only increments after a previous open", async () => {
    const statuses: { status: string; reconnectCount: number }[] = []
    function StatusReader() {
      const { status, reconnectCount } = useWorkspaceRealtimeContext()
      statuses.push({ status, reconnectCount })
      return null
    }
    await render(<StatusReader />)

    act(() => {
      captured?.onOpen?.()
    })
    expect(statuses.at(-1)).toEqual({ status: "open", reconnectCount: 0 })

    act(() => {
      captured?.onClose?.()
    })
    expect(statuses.at(-1)).toEqual({ status: "closed", reconnectCount: 0 })

    act(() => {
      captured?.onOpen?.()
    })
    expect(statuses.at(-1)).toEqual({ status: "open", reconnectCount: 1 })
  })

  test("useWorkspaceRealtimeContext throws outside the provider", () => {
    function Consumer() {
      useWorkspaceRealtimeContext()
      return null
    }
    expect(() => {
      act(() => {
        root.render(<Consumer />)
      })
    }).toThrow(
      "useWorkspaceRealtimeContext must be used within a WorkspaceRealtimeProvider",
    )
  })

  describe("envelope validation", () => {
    test.each([
      ["null", "null"],
      ["a number", "1"],
      ["an array", "[]"],
      ["an empty object", "{}"],
    ])("warns and drops a frame that is %s, without throwing", async (_label, jsonBody) => {
      await render(null)

      expect(() => {
        act(() => {
          captured?.onMessage?.({ data: jsonBody })
        })
      }).not.toThrow()

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.anything() }),
        expect.stringContaining("envelope"),
      )
    })

    test("a valid envelope with an unknown eventType is still accepted at the envelope stage and only dropped by the unknown-event check", async () => {
      await render(null)

      expect(() => {
        act(() => {
          captured?.onMessage?.({
            data: JSON.stringify({ eventType: "someFutureEvent", data: {} }),
          })
        })
      }).not.toThrow()
      expect(loggerMock.warn).not.toHaveBeenCalled()
    })
  })

  describe("listener exception containment", () => {
    test("a throwing listener does not prevent a second listener from receiving the event, and nothing escapes", async () => {
      const throwingHandler = vi.fn(() => {
        throw new Error("boom")
      })
      const secondHandler = vi.fn()
      function Subscribers() {
        useWorkspaceRealtimeEvents({ messageDeleted: throwingHandler })
        useWorkspaceRealtimeEvents({ messageDeleted: secondHandler })
        return null
      }
      await render(<Subscribers />)

      expect(() => {
        act(() => {
          emit("messageDeleted", { messageIds: ["m1"] })
        })
      }).not.toThrow()

      expect(throwingHandler).toHaveBeenCalledTimes(1)
      expect(secondHandler).toHaveBeenCalledTimes(1)
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          err: expect.anything(),
          eventType: "messageDeleted",
        }),
        expect.stringContaining("threw"),
      )
    })

    test("a listener that throws on every dispatch is rate-limited, not logged once per event", async () => {
      const throwingHandler = vi.fn(() => {
        throw new Error("boom")
      })
      function Subscriber() {
        useWorkspaceRealtimeEvents({ messageDeleted: throwingHandler })
        return null
      }
      await render(<Subscriber />)

      for (let i = 0; i < 7; i++) {
        act(() => {
          emit("messageDeleted", { messageIds: ["m1"] })
        })
      }

      expect(throwingHandler).toHaveBeenCalledTimes(7)
      // 5 normal + 1 suppression summary, then silent — same limiter, same
      // reason+eventType key as any other warning path.
      expect(loggerMock.warn).toHaveBeenCalledTimes(6)
      expect(loggerMock.warn).toHaveBeenNthCalledWith(
        6,
        expect.objectContaining({
          suppressed: true,
          eventType: "messageDeleted",
        }),
        expect.stringContaining("suppressed"),
      )
    })

    test("a listener throwing on a different eventType is not suppressed by the first event's rate limit", async () => {
      const throwingOnDeleted = vi.fn(() => {
        throw new Error("boom")
      })
      const throwingOnFailed = vi.fn(() => {
        throw new Error("boom")
      })
      function Subscriber() {
        useWorkspaceRealtimeEvents({
          messageDeleted: throwingOnDeleted,
          messageFailed: throwingOnFailed,
        })
        return null
      }
      await render(<Subscriber />)

      for (let i = 0; i < 6; i++) {
        act(() => {
          emit("messageDeleted", { messageIds: ["m1"] })
        })
      }
      loggerMock.warn.mockClear()

      act(() => {
        emit("messageFailed", {
          messageId: "m1",
          clientId: "c1",
          error: "boom",
        })
      })

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: "messageFailed" }),
        expect.stringContaining("threw"),
      )
    })
  })

  describe("rate-limited warnings", () => {
    test("logs at most the limit, then one suppression summary, then nothing else for the same reason", async () => {
      await render(null)

      // 5 warnings should log normally, the 6th logs one suppression
      // summary, and the 7th+ are silent — see
      // `realtime-warn-limiter.ts` (limit is 5 per window).
      for (let i = 0; i < 7; i++) {
        act(() => {
          captured?.onMessage?.({ data: "not json" })
        })
      }

      expect(loggerMock.warn).toHaveBeenCalledTimes(6)
      expect(loggerMock.warn).toHaveBeenNthCalledWith(
        6,
        expect.objectContaining({ suppressed: true }),
        expect.stringContaining("suppressed"),
      )
    })
  })

  describe("React Strict Mode", () => {
    const renderStrict = (children: React.ReactNode) =>
      act(() => {
        root.render(
          <StrictMode>
            <WorkspaceRealtimeProvider>{children}</WorkspaceRealtimeProvider>
          </StrictMode>,
        )
      })

    test("a single onOpen right after a Strict Mode mount is not reported as a reconnect", async () => {
      const statuses: { status: string; reconnectCount: number }[] = []
      function StatusReader() {
        const { status, reconnectCount } = useWorkspaceRealtimeContext()
        statuses.push({ status, reconnectCount })
        return null
      }
      await renderStrict(<StatusReader />)

      act(() => {
        captured?.onOpen?.()
      })

      expect(statuses.at(-1)).toEqual({ status: "open", reconnectCount: 0 })

      act(() => {
        captured?.onClose?.()
      })
      act(() => {
        captured?.onOpen?.()
      })
      expect(statuses.at(-1)).toEqual({ status: "open", reconnectCount: 1 })
    })

    test("exactly one active subscription per event after the double-mount cycle", async () => {
      const handler = vi.fn()
      function Subscriber() {
        useWorkspaceRealtimeEvents({ messageDeleted: handler })
        return null
      }
      await renderStrict(<Subscriber />)

      act(() => {
        emit("messageDeleted", { messageIds: ["m1"] })
      })

      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  test("the exposed context value does not include the raw `subscribe` primitive — only subscribeHandlers is public", async () => {
    let capturedContextValue: Record<string, unknown> | undefined
    function Probe() {
      capturedContextValue = useWorkspaceRealtimeContext() as unknown as Record<
        string,
        unknown
      >
      return null
    }
    await render(<Probe />)

    expect(capturedContextValue).not.toHaveProperty("subscribe")
    expect(capturedContextValue).toHaveProperty("subscribeHandlers")
    expect(capturedContextValue).toHaveProperty("status")
    expect(capturedContextValue).toHaveProperty("reconnectCount")
  })

  /**
   * Codex release-blocker fix (HIGH): a QUIET room — an already-open tab,
   * no new connect, no inbound broadcast — had no independent liveness
   * signal, so a silently-stalled realtime-side report loop would never
   * self-heal until presence had already expired. The client now sends a
   * tiny keep-alive ping over the ALREADY-OPEN workspace socket on the same
   * fixed cadence the realtime side reports on
   * (`PRESENCE_REPORT_INTERVAL_MS`) — a widely used presence pattern
   * (a heartbeat sent over the existing open socket rather than a new
   * connection) — so the party's `onMessage` handler always has a chance to notice and
   * recover a stalled loop, without ever adding a new HTTP round trip.
   */
  describe("presence keep-alive ping", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test("sends a ping frame over the existing socket on the fixed report interval while open", async () => {
      await render(null)
      act(() => {
        captured?.onOpen?.()
      })
      socketSendMock.mockClear()

      act(() => {
        vi.advanceTimersByTime(PRESENCE_REPORT_INTERVAL_MS)
      })

      expect(socketSendMock).toHaveBeenCalledTimes(1)
      expect(socketSendMock).toHaveBeenCalledWith(
        serializePresencePingMessage(),
      )

      act(() => {
        vi.advanceTimersByTime(PRESENCE_REPORT_INTERVAL_MS * 2)
      })

      expect(socketSendMock).toHaveBeenCalledTimes(3)
    })

    test("never sends a ping before the socket has opened", async () => {
      await render(null)

      act(() => {
        vi.advanceTimersByTime(PRESENCE_REPORT_INTERVAL_MS * 3)
      })

      expect(socketSendMock).not.toHaveBeenCalled()
    })

    test("stops sending pings once the socket closes, and never over HTTP", async () => {
      await render(null)
      act(() => {
        captured?.onOpen?.()
      })
      act(() => {
        vi.advanceTimersByTime(PRESENCE_REPORT_INTERVAL_MS)
      })
      expect(socketSendMock).toHaveBeenCalledTimes(1)

      act(() => {
        captured?.onClose?.()
      })
      socketSendMock.mockClear()

      act(() => {
        vi.advanceTimersByTime(PRESENCE_REPORT_INTERVAL_MS * 3)
      })

      expect(socketSendMock).not.toHaveBeenCalled()
    })

    test("stops sending pings on unmount", async () => {
      await render(null)
      act(() => {
        captured?.onOpen?.()
      })
      socketSendMock.mockClear()

      act(() => root.unmount())

      act(() => {
        vi.advanceTimersByTime(PRESENCE_REPORT_INTERVAL_MS * 3)
      })

      expect(socketSendMock).not.toHaveBeenCalled()
    })
  })
})
