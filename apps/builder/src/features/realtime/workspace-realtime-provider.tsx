"use client"

import {
  REALTIME_CLOSE_CODE,
  type RealtimeEventData,
  RealtimeEventType,
  RealtimeSocket,
  realtimeBatchEnvelopeSchema,
  realtimeEventEnvelopeSchema,
} from "@chatbotx.io/partysocket-config"
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

const STREAM_ID_PATTERN = /^\d+-\d+$/

const isStreamSequenceAfter = (
  candidate: string,
  previous: string,
): boolean => {
  const [candidateMilliseconds, candidateSequence] = candidate
    .split("-")
    .map(BigInt)
  const [previousMilliseconds, previousSequence] = previous
    .split("-")
    .map(BigInt)

  return (
    candidateMilliseconds > previousMilliseconds ||
    (candidateMilliseconds === previousMilliseconds &&
      candidateSequence > previousSequence)
  )
}

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
  status: WorkspaceRealtimeConnectionStatus
  reconnectCount: number
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
  const [reconnectCount, setReconnectCount] = useState(0)
  const hasOpenedOnceRef = useRef(false)
  const lastProcessedSeqRef = useRef<string | null>(null)
  // React Strict Mode (dev only) double-invokes mount effects: setup, cleanup,
  // setup again. Resetting this marker ensures the synthetic remount is not
  // surfaced as a user-visible reconnect.
  useEffect(
    () => () => {
      hasOpenedOnceRef.current = false
    },
    [],
  )

  /**
   * Validates and dispatches one already-JSON-parsed frame: envelope shape ->
   * narrow `eventType` (unknown names silently ignored for forward-compat) ->
   * validate `data` against `REALTIME_EVENT_SCHEMAS` when present -> dispatch
   * to listeners, each in its own try/catch so one throwing listener doesn't
   * block the rest. Shared by the single-event (v1) and batch (v2) frame
   * shapes — a v2 batch calls this once per contained event.
   */
  const processRealtimeFrame = useCallback((frame: unknown): void => {
    const envelopeResult = realtimeEventEnvelopeSchema.safeParse(frame)
    if (!envelopeResult.success) {
      logRealtimeWarning({
        error: envelopeResult.error,
        message:
          "Workspace realtime: message frame is not a valid event envelope",
        reason: "invalid-envelope",
        suppressionMessage:
          "Workspace realtime: further invalid-envelope warnings suppressed for this window",
      })
      return
    }

    const { eventType: eventTypeString, data } = envelopeResult.data
    if (!isKnownRealtimeEventName(eventTypeString)) {
      // Unknown to this build — forward-compatible, no warning noise.
      return
    }
    const eventType = eventTypeString

    const listeners = listenersRef.current.get(eventType)
    if (!listeners || listeners.size === 0) {
      // Nobody subscribed — also silently ignored.
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

    // TS can't correlate this runtime-narrowed string with one union
    // member, hence the assertion. Only events with a schema in
    // `REALTIME_EVENT_SCHEMAS` have `data` validated here.
    const dispatchedEvent = {
      eventType,
      data,
    } as unknown as RealtimeEventData

    for (const listener of listeners) {
      try {
        listener(dispatchedEvent)
      } catch (error) {
        // Keyed by `eventType` (already narrowed, bounded by
        // `RealtimeEventType`) — a listener that throws on every dispatch of
        // one busy event never drowns out warnings for an unrelated one.
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
  }, [])

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

      const batchResult = realtimeBatchEnvelopeSchema.safeParse(parsedJson)
      if (batchResult.success) {
        const { batch, seq } = batchResult.data
        if (
          seq &&
          lastProcessedSeqRef.current &&
          !isStreamSequenceAfter(seq, lastProcessedSeqRef.current)
        ) {
          return
        }
        if (seq) {
          lastProcessedSeqRef.current = seq
        }
        for (const frame of batch) {
          processRealtimeFrame(frame)
        }
        return
      }

      processRealtimeFrame(parsedJson)
    },
    [processRealtimeFrame],
  )

  useEffect(() => {
    let disposed = false
    const lastSeqStorageKey = `realtime:last-seq:${workspaceId}`
    const persistedLastSeq = localStorage.getItem(lastSeqStorageKey)
    lastProcessedSeqRef.current =
      persistedLastSeq && STREAM_ID_PATTERN.test(persistedLastSeq)
        ? persistedLastSeq
        : null
    const persistLastSeq = (): void => {
      const lastProcessedSeq = lastProcessedSeqRef.current
      if (!lastProcessedSeq) {
        return
      }
      localStorage.setItem(lastSeqStorageKey, lastProcessedSeq)
    }
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
        const lastSeq = localStorage.getItem(lastSeqStorageKey)
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
      onMessage: (data) => {
        processSocketMessage(data)
        persistLastSeq()
      },
      onOpen: () => {
        if (hasOpenedOnceRef.current) {
          setReconnectCount((count) => count + 1)
        }
        hasOpenedOnceRef.current = true
        setStatus("open")
      },
      onResync: () => {
        if (!disposed) {
          setStatus("resyncing")
        }
      },
    })
    const handleOnline = () => socket.handleOnline()
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        socket.handleVisibilityVisible()
      }
    }

    window.addEventListener("online", handleOnline)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    socket.connect()

    return () => {
      disposed = true
      window.removeEventListener("online", handleOnline)
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
    () => ({ subscribeHandlers, status, reconnectCount }),
    [subscribeHandlers, status, reconnectCount],
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
