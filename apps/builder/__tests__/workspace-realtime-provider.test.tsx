import {
  REALTIME_EVENT_TOPICS,
  type RealtimeTopic,
  serializeRealtimeSubscriptionMessage,
} from "@chatbotx.io/partysocket-config"
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
  useTenantSettings: () => ({
    publicRealtimeUrl: "ws://localhost:1999",
  }),
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
  query?: () => Promise<Record<string, string>>
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

// Dynamic import required: the module under test must load after the
// `vi.mock` calls above register, which a static top-level import would
// race (vi.mock hoisting only reorders vi.mock calls themselves).
const {
  REALTIME_TRAILING_RESYNC_DELAY_MS,
  WorkspaceRealtimeProvider,
  useWorkspaceRealtimeContext,
} = await import("@/features/realtime/workspace-realtime-provider")
const { useWorkspaceRealtimeEvents } = await import(
  "@/features/realtime/use-workspace-realtime-events"
)

function emit(eventType: string, data: unknown) {
  captured?.onMessage?.({ data: JSON.stringify({ eventType, data }) })
}

function emitBatch(events: { eventType: string; data: unknown }[]) {
  captured?.onMessage?.({ data: JSON.stringify({ batch: events }) })
}

/** Every `socket.send` call whose payload is a subscribe frame, decoded. */
function sentSubscriptions(): RealtimeTopic[][] {
  return socketSendMock.mock.calls
    .map(([payload]) => JSON.parse(payload as string))
    .filter(
      (frame): frame is { type: "subscribe"; topics: RealtimeTopic[] } =>
        frame?.type === "subscribe",
    )
    .map((frame) => frame.topics)
}

/** Every `socket.send` call whose payload is the presence-ping frame. */
function sentPingCount(): number {
  return socketSendMock.mock.calls.filter(
    ([payload]) => payload === serializePresencePingMessage(),
  ).length
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

    // A handler-identity change re-renders (and re-calls the hook) but
    // fires no new onOpen/onClose, so the connection itself is untouched.
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

  // A quiet room (open tab, no new connect, no inbound broadcast) has no
  // liveness signal otherwise, so a stalled report loop would never
  // self-heal until presence expired — the ping is a heartbeat over the
  // already-open socket on the same cadence as `PRESENCE_REPORT_INTERVAL_MS`.
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

      // A trailing subscription resync (see the "trailing resync" suite
      // below) also lands inside this window — isolate ping-shaped frames.
      expect(sentPingCount()).toBe(1)

      act(() => {
        vi.advanceTimersByTime(PRESENCE_REPORT_INTERVAL_MS * 2)
      })

      expect(sentPingCount()).toBe(3)
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
      expect(sentPingCount()).toBe(1)

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

  describe("protocol v2 connection request (B2)", () => {
    test("requests protocol v2 alongside the short-lived connect token", async () => {
      await render(null)

      await expect(captured?.query?.()).resolves.toEqual({
        protocol: "v2",
        token: "token-1",
      })
    })
  })

  describe("batch frame dispatch (B2)", () => {
    test("dispatches every event inside a single v2 batch frame to its registered handler", async () => {
      const messageDeletedHandler = vi.fn()
      const contactBlockedHandler = vi.fn()
      function Subscriber() {
        useWorkspaceRealtimeEvents({
          contactBlocked: contactBlockedHandler,
          messageDeleted: messageDeletedHandler,
        })
        return null
      }
      await render(<Subscriber />)

      act(() => {
        emitBatch([
          { eventType: "messageDeleted", data: { messageIds: ["m1"] } },
          { eventType: "contactBlocked", data: { contactId: "c1" } },
        ])
      })

      expect(messageDeletedHandler).toHaveBeenCalledWith({
        eventType: "messageDeleted",
        data: { messageIds: ["m1"] },
      })
      expect(contactBlockedHandler).toHaveBeenCalledWith({
        eventType: "contactBlocked",
        data: { contactId: "c1" },
      })
    })

    test("a malformed event inside a batch is dropped without blocking the rest of the batch", async () => {
      const validHandler = vi.fn()
      const malformedHandler = vi.fn()
      function Subscriber() {
        useWorkspaceRealtimeEvents({
          messageDeleted: validHandler,
          whatsappCallTransportIncoming: malformedHandler,
        })
        return null
      }
      await render(<Subscriber />)

      act(() => {
        emitBatch([
          // Missing every required field of realtimeCallTransportIncomingSchema.
          { eventType: "whatsappCallTransportIncoming", data: { bogus: true } },
          { eventType: "messageDeleted", data: { messageIds: ["m1"] } },
        ])
      })

      expect(malformedHandler).not.toHaveBeenCalled()
      expect(validHandler).toHaveBeenCalledWith({
        eventType: "messageDeleted",
        data: { messageIds: ["m1"] },
      })
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "whatsappCallTransportIncoming",
        }),
        expect.stringContaining("schema"),
      )
    })
  })

  describe("topic subscription inference (B3)", () => {
    test("sends the topics implied by the currently-registered handlers once the socket opens", async () => {
      function Subscriber() {
        useWorkspaceRealtimeEvents({ messageDeleted: vi.fn() })
        return null
      }
      await render(<Subscriber />)

      act(() => {
        captured?.onOpen?.()
      })

      expect(sentSubscriptions().at(-1)).toEqual(
        REALTIME_EVENT_TOPICS.messageDeleted,
      )
      // Exact wire frame — same serializer the party's schema parses.
      expect(socketSendMock).toHaveBeenCalledWith(
        serializeRealtimeSubscriptionMessage(
          REALTIME_EVENT_TOPICS.messageDeleted,
        ),
      )
    })

    test("a handler for a mixed-topic event subscribes to every one of its topics", async () => {
      function Subscriber() {
        useWorkspaceRealtimeEvents({ conversationAssigned: vi.fn() })
        return null
      }
      await render(<Subscriber />)

      act(() => {
        captured?.onOpen?.()
      })

      expect(new Set(sentSubscriptions().at(-1))).toEqual(
        new Set(REALTIME_EVENT_TOPICS.conversationAssigned),
      )
    })

    test("adds a topic once a handler for it mounts while the socket is already open", async () => {
      function ChatSubscriber() {
        useWorkspaceRealtimeEvents({ messageDeleted: vi.fn() })
        return null
      }
      function VoipSubscriber() {
        useWorkspaceRealtimeEvents({ whatsappCallTransportIncoming: vi.fn() })
        return null
      }
      await render(<ChatSubscriber />)
      act(() => {
        captured?.onOpen?.()
      })
      socketSendMock.mockClear()

      await act(() => {
        root.render(
          <WorkspaceRealtimeProvider>
            <ChatSubscriber />
            <VoipSubscriber />
          </WorkspaceRealtimeProvider>,
        )
      })

      expect(new Set(sentSubscriptions().at(-1))).toEqual(
        new Set(["chat", "voip"]),
      )
    })

    test("drops a topic once the last handler for it unmounts (refcounted to zero)", async () => {
      function ChatSubscriber() {
        useWorkspaceRealtimeEvents({ messageDeleted: vi.fn() })
        return null
      }
      function VoipSubscriber() {
        useWorkspaceRealtimeEvents({ whatsappCallTransportIncoming: vi.fn() })
        return null
      }
      await render(
        <>
          <ChatSubscriber />
          <VoipSubscriber />
        </>,
      )
      act(() => {
        captured?.onOpen?.()
      })
      socketSendMock.mockClear()

      await act(() => {
        root.render(
          <WorkspaceRealtimeProvider>
            <ChatSubscriber />
          </WorkspaceRealtimeProvider>,
        )
      })

      expect(sentSubscriptions().at(-1)).toEqual(["chat"])
    })

    test("keeps a topic subscribed while a second handler for it remains registered", async () => {
      function FirstChatSubscriber() {
        useWorkspaceRealtimeEvents({ messageDeleted: vi.fn() })
        return null
      }
      function SecondChatSubscriber() {
        useWorkspaceRealtimeEvents({ contactBlocked: vi.fn() })
        return null
      }
      await render(
        <>
          <FirstChatSubscriber key="first" />
          <SecondChatSubscriber key="second" />
        </>,
      )
      act(() => {
        captured?.onOpen?.()
      })
      socketSendMock.mockClear()

      await act(() => {
        root.render(
          <WorkspaceRealtimeProvider>
            <SecondChatSubscriber key="second" />
          </WorkspaceRealtimeProvider>,
        )
      })

      // messageDeleted's handler unmounted, but contactBlocked (also "chat")
      // is still registered — the topic must not drop out.
      expect(sentSubscriptions().at(-1)).toEqual(["chat"])
    })
  })

  describe("trailing resync (B5)", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test("resends the current topic subscription once REALTIME_TRAILING_RESYNC_DELAY_MS after opening", async () => {
      function Subscriber() {
        useWorkspaceRealtimeEvents({ messageDeleted: vi.fn() })
        return null
      }
      await render(<Subscriber />)
      act(() => {
        captured?.onOpen?.()
      })
      socketSendMock.mockClear()

      act(() => {
        vi.advanceTimersByTime(REALTIME_TRAILING_RESYNC_DELAY_MS)
      })

      expect(sentSubscriptions()).toEqual([
        REALTIME_EVENT_TOPICS.messageDeleted,
      ])
    })

    test("never fires the trailing resync once the socket has closed", async () => {
      await render(null)
      act(() => {
        captured?.onOpen?.()
      })
      act(() => {
        captured?.onClose?.()
      })
      socketSendMock.mockClear()

      act(() => {
        vi.advanceTimersByTime(REALTIME_TRAILING_RESYNC_DELAY_MS)
      })

      expect(socketSendMock).not.toHaveBeenCalled()
    })
  })
})
