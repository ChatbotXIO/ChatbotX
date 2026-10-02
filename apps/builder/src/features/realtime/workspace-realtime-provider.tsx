"use client"

import {
  isRealtimeSeqAfter,
  REALTIME_CLOSE_CODE,
  type RealtimeEventData,
  RealtimeEventType,
  RealtimeSocket,
  realtimeBatchEnvelopeSchema,
} from "@chatbotx.io/realtime-protocol"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useTenantSettings } from "@/features/tenant"
import { useWorkspaceId } from "@/hooks/routing"
import { logger } from "@/lib/log"
import { client } from "@/lib/orpc/orpc"
import { REALTIME_EVENT_SCHEMAS } from "./realtime-event-validation"
import { decideRealtimeWarnLogging } from "./realtime-warn-limiter"
import type {
  RealtimeEvent,
  RealtimeEventName,
  RealtimeHandlerMap,
} from "./types"

/**
 * Connection lifecycle of the single workspace socket.
 */
export type WorkspaceRealtimeConnectionStatus =
  | "connecting"
  | "open"
  | "closed"
  | "resyncing"

/**
 * Every event this build's `workspaces` party can emit, as a `Set` for O(1)
 * membership checks — used to narrow a parsed string into `RealtimeEventName`
 * without a cast.
 */
const KNOWN_REALTIME_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(RealtimeEventType),
)

/**
 * Real type guard (no `as`) — narrows an arbitrary string from a parsed frame
 * to `RealtimeEventName` only when this build knows that event. A staggered
 * deploy sending a newer event name falls through here, not through a cast.
 */
function isKnownRealtimeEventName(value: string): value is RealtimeEventName {
  return KNOWN_REALTIME_EVENT_NAMES.has(value)
}

/**
 * A listener's real parameter type is `(event: RealtimeEvent<K>) => void` for
 * the specific `K` it registered under. This erased shape is what the registry
 * stores, since a single `Map`/`Set` can't hold a distinct generic
 * instantiation per entry.
 */
type ErasedRealtimeListener = (event: RealtimeEventData) => void

const logRealtimeWarning = ({
  error,
  eventType,
  message,
  reason,
  suppressionMessage,
}: {
  error: unknown
  eventType?: RealtimeEventName
  message: string
  reason: string
  suppressionMessage: string
}): void => {
  const decision = decideRealtimeWarnLogging(reason, eventType)
  if (!decision.shouldLog) {
    return
  }

  logger.warn(
    {
      err: error,
      ...(eventType ? { eventType } : {}),
      suppressed: decision.isSuppressionSummary,
    },
    decision.isSuppressionSummary ? suppressionMessage : message,
  )
}

export type WorkspaceRealtimeSubscribe = <K extends RealtimeEventName>(
  eventType: K,
  listener: (event: RealtimeEvent<K>) => void,
) => () => void

type WorkspaceRealtimeContextValue = {
  /**
   * Registers one listener per name in `eventTypes`, each re-reading
   * `getHandlers()` on every dispatch — so a caller whose handler identities
   * change across renders always gets the latest handler without re-
   * subscribing.
   */
  subscribeHandlers: (
    eventTypes: RealtimeEventName[],
    getHandlers: () => RealtimeHandlerMap,
  ) => () => void
  resyncCount: number
  status: WorkspaceRealtimeConnectionStatus
}

const WorkspaceRealtimeContext =
  createContext<WorkspaceRealtimeContextValue | null>(null)

/**
 * Erasure to `RealtimeEventData` is sound because registration and dispatch
 * always share the same `eventType` string, even though TS can't correlate a
 * dynamically-looked-up key with one union member.
 */
function invokeErasedHandler(handler: unknown, event: RealtimeEventData): void {
  if (typeof handler !== "function") {
    return
  }
  const erased = handler as ErasedRealtimeListener
  erased(event)
}

/**
 * Single owner of the workspace's realtime socket — one connection per tab.
 * Incoming frames: parse -> validate envelope -> narrow `eventType` (unknown
 * names silently ignored for forward-compat) -> validate `data` against
 * `REALTIME_EVENT_SCHEMAS` when present -> dispatch to listeners, each in its
 * own try/catch so one throwing listener doesn't block the rest.
 */
export function WorkspaceRealtimeProvider({
  children,
}: {
  children: ReactNode
}) {
  const workspaceId = useWorkspaceId()
  const { publicRealtimeUrl } = useTenantSettings()
  const listenersRef = useRef(
    new Map<RealtimeEventName, Set<ErasedRealtimeListener>>(),
  )
  const [status, setStatus] =
    useState<WorkspaceRealtimeConnectionStatus>("connecting")
  const [resyncCount, setResyncCount] = useState(0)
  const lastProcessedSeqRef = useRef<string | null>(null)

  const processRealtimeEvent = useCallback(
    (frame: { data: unknown; eventType: string }): void => {
      const { eventType: eventTypeString, data } = frame
      if (!isKnownRealtimeEventName(eventTypeString)) {
        return
      }
      const eventType = eventTypeString

      const listeners = listenersRef.current.get(eventType)
      if (!listeners || listeners.size === 0) {
        return
      }

      const schema = REALTIME_EVENT_SCHEMAS[eventType]
      if (schema) {
        const result = schema.safeParse(data)
        if (!result.success) {
          logRealtimeWarning({
            error: result.error,
            eventType,
            message: "Workspace realtime: event failed schema validation",
            reason: "schema-invalid",
            suppressionMessage:
              "Workspace realtime: further schema-validation warnings suppressed for this window",
          })
          return
        }
      }

      const dispatchedEvent = {
        eventType,
        data,
      } as unknown as RealtimeEventData

      for (const listener of listeners) {
        try {
          listener(dispatchedEvent)
        } catch (error) {
          logRealtimeWarning({
            error,
            eventType,
            message:
              "Workspace realtime: a listener threw while handling an event",
            reason: "listener-threw",
            suppressionMessage:
              "Workspace realtime: further listener-threw warnings suppressed for this window",
          })
        }
      }
    },
    [],
  )

  const processSocketMessage = useCallback(
    (data: string): void => {
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(data)
      } catch (error) {
        logRealtimeWarning({
          error,
          message: "Workspace realtime: could not parse message frame",
          reason: "malformed-json",
          suppressionMessage:
            "Workspace realtime: further malformed-JSON warnings suppressed for this window",
        })
        return
      }

      if (parsedJson && typeof parsedJson === "object" && "hb" in parsedJson) {
        return
      }
      const batchResult = realtimeBatchEnvelopeSchema.safeParse(parsedJson)
      if (!batchResult.success) {
        logRealtimeWarning({
          error: batchResult.error,
          message: "Workspace realtime: message frame is not a valid batch",
          reason: "invalid-batch",
          suppressionMessage:
            "Workspace realtime: further invalid-batch warnings suppressed for this window",
        })
        return
      }
      const { batch, seq } = batchResult.data
      if (
        seq &&
        lastProcessedSeqRef.current &&
        !isRealtimeSeqAfter(seq, lastProcessedSeqRef.current)
      ) {
        return
      }
      if (seq) {
        lastProcessedSeqRef.current = seq
      }
      for (const frame of batch) {
        processRealtimeEvent(frame)
      }
    },
    [processRealtimeEvent],
  )

  useEffect(() => {
    let disposed = false
    lastProcessedSeqRef.current = null
    setStatus("connecting")
    const socket = new RealtimeSocket({
      getUrl: async () => {
        const { token } =
          await client.realtimeAPI.mintWorkspaceConnectTokenAuthenticatedAPI({
            workspaceId,
          })
        const socketUrl = new URL(
          `/rt/workspaces/${encodeURIComponent(workspaceId)}`,
          publicRealtimeUrl,
        )
        socketUrl.searchParams.set("token", token)
        const lastSeq = lastProcessedSeqRef.current
        if (lastSeq) {
          socketUrl.searchParams.set("lastSeq", lastSeq)
        }
        return socketUrl.toString()
      },
      onClose: ({ code }) => {
        if (disposed) {
          return
        }
        setStatus(
          code === REALTIME_CLOSE_CODE.revoked ? "closed" : "connecting",
        )
      },
      onMessage: processSocketMessage,
      onOpen: () => {
        setStatus("open")
      },
      onResync: () => {
        if (!disposed) {
          setResyncCount((count) => count + 1)
          setStatus("resyncing")
        }
      },
    })
    const reconnectNow = () => socket.reconnectNow()
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        reconnectNow()
      }
    }

    window.addEventListener("online", reconnectNow)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    socket.connect()

    return () => {
      disposed = true
      window.removeEventListener("online", reconnectNow)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      socket.close()
    }
  }, [processSocketMessage, publicRealtimeUrl, workspaceId])

  const subscribe = useCallback<WorkspaceRealtimeSubscribe>(
    (eventType, listener) => {
      const listenersByType = listenersRef.current
      let listeners = listenersByType.get(eventType)
      if (!listeners) {
        listeners = new Set()
        listenersByType.set(eventType, listeners)
      }
      // Erasure boundary — see `invokeErasedHandler`; same soundness argument
      // applies: this listener is only ever looked up and called under this
      // exact `eventType`.
      const erased = listener as unknown as ErasedRealtimeListener
      listeners.add(erased)
      return () => {
        listeners?.delete(erased)
      }
    },
    [],
  )

  const subscribeHandlers = useCallback(
    (
      eventTypes: RealtimeEventName[],
      getHandlers: () => RealtimeHandlerMap,
    ): (() => void) => {
      const unsubscribes = eventTypes.map((eventType) =>
        subscribe(eventType, (event) => {
          invokeErasedHandler(getHandlers()[eventType], event)
        }),
      )

      return () => {
        for (const unsubscribe of unsubscribes) {
          unsubscribe()
        }
      }
    },
    [subscribe],
  )

  // `subscribe` is intentionally NOT part of the exposed context value — it's
  // an internal primitive only `subscribeHandlers` needs;
  // `useWorkspaceRealtimeEvents` goes through `subscribeHandlers`, never
  // `subscribe` directly.
  const value = useMemo<WorkspaceRealtimeContextValue>(
    () => ({ resyncCount, status, subscribeHandlers }),
    [resyncCount, status, subscribeHandlers],
  )

  return (
    <WorkspaceRealtimeContext.Provider value={value}>
      {children}
    </WorkspaceRealtimeContext.Provider>
  )
}

export function useWorkspaceRealtimeContext(): WorkspaceRealtimeContextValue {
  const context = useContext(WorkspaceRealtimeContext)
  if (!context) {
    throw new Error(
      "useWorkspaceRealtimeContext must be used within a WorkspaceRealtimeProvider",
    )
  }
  return context
}
