"use client"

import type {
  RealtimeEventData,
  RealtimeTopic,
} from "@chatbotx.io/partysocket-config"
import {
  REALTIME_EVENT_TOPICS,
  RealtimeEventType,
  realtimeBatchEnvelopeSchema,
  realtimeEventEnvelopeSchema,
  serializeRealtimeSubscriptionMessage,
} from "@chatbotx.io/partysocket-config"
import {
  PRESENCE_REPORT_INTERVAL_MS,
  serializePresencePingMessage,
} from "@chatbotx.io/partysocket-config/presence"
import usePartySocket from "partysocket/react"
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
 * Connection lifecycle of the single workspace socket — mirrors `PartySocket`'s
 * readyState, collapsed to the three states a subscriber actually needs.
 */
export type WorkspaceRealtimeConnectionStatus = "connecting" | "open" | "closed"

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
  // Set synchronously in `onOpen`/`onClose` so socket-message senders never
  // read a stale render's `status` — those senders (`sendCurrentTopicsRef`)
  // must observe the live connection state, not a closed-over one.
  const isOpenRef = useRef(false)
  // Forward-declared: `onOpen` below needs to call the real sender, but the
  // sender itself needs `socket`, which `usePartySocket` has not returned yet
  // at this point in the render. Assigned once `socket` exists (same pattern
  // as `bubbleRingingConversationRef` in chat-realtime.tsx).
  const sendCurrentTopicsRef = useRef<() => void>(() => undefined)

  // React Strict Mode (dev only) double-invokes mount effects: setup, cleanup,
  // setup again. Without this, the second synthetic mount's `onOpen` would see
  // `hasOpenedOnceRef.current` already `true` from the first (torn down) mount
  // and misreport it as a reconnect. This cleanup resets the flag between the
  // two synthetic mounts.
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
  const processRealtimeFrame = (frame: unknown): void => {
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
  }

  const socket = usePartySocket({
    host: publicRealtimeUrl,
    room: workspaceId,
    party: "workspaces",

    query: async () => {
      // Short-lived token bound to this member and workspace room — the
      // `workspaces` party rejects the upgrade for any other room.
      const { token } =
        await client.realtimeAPI.mintWorkspaceConnectTokenAuthenticatedAPI({
          workspaceId,
        })

      return { protocol: "v2", token }
    },

    onOpen: () => {
      if (hasOpenedOnceRef.current) {
        setReconnectCount((count) => count + 1)
      }
      hasOpenedOnceRef.current = true
      isOpenRef.current = true
      setStatus("open")

      // The server's per-connection topic state starts empty, so every open
      // must immediately re-send this tab's current subscriptions.
      sendCurrentTopicsRef.current()
    },

    onClose: () => {
      isOpenRef.current = false
      setStatus("closed")
    },

    onMessage(event) {
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(event.data)
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

      // Protocol v2 always wraps deliverable events in one batch frame, even
      // for a single event. A v1 frame (or a malformed batch envelope) falls
      // through to the single-frame path below.
      const batchResult = realtimeBatchEnvelopeSchema.safeParse(parsedJson)
      if (batchResult.success) {
        for (const frame of batchResult.data.batch) {
          processRealtimeFrame(frame)
        }
        return
      }

      processRealtimeFrame(parsedJson)
    },
  })

  /**
   * Union of every topic implied by a currently-registered event-type
   * listener — "inferred/refcounted from registered realtime handlers": a
   * topic stays subscribed as long as at least one handler for one of its
   * event names is registered (the existing per-event-type `Set` in
   * `listenersRef` already IS that refcount), and drops out the instant the
   * last one unregisters.
   */
  const computeSubscribedTopics = (): RealtimeTopic[] => {
    const topics = new Set<RealtimeTopic>()
    for (const [eventType, listeners] of listenersRef.current) {
      if (listeners.size === 0) {
        continue
      }
      for (const topic of REALTIME_EVENT_TOPICS[eventType].topics) {
        topics.add(topic)
      }
    }
    return [...topics]
  }

  // Resolved now that `socket` exists — see the forward declaration above
  // `usePartySocket`. Reassigned every render so it always closes over the
  // latest `socket`; cheap, and `listenersRef`/`isOpenRef` are read fresh on
  // every call regardless.
  sendCurrentTopicsRef.current = () => {
    if (!isOpenRef.current) {
      return
    }
    socket.send(serializeRealtimeSubscriptionMessage(computeSubscribedTopics()))
  }

  // Presence ping frame on the same cadence as the party's report interval —
  // a quiet room (no new connections, no broadcasts) has no other self-heal
  // trigger to re-arm the party's presence report loop.
  useEffect(() => {
    if (status !== "open") {
      return
    }
    const intervalId = setInterval(() => {
      socket.send(serializePresencePingMessage())
    }, PRESENCE_REPORT_INTERVAL_MS)
    return () => {
      clearInterval(intervalId)
    }
  }, [status, socket])

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
      // A newly-registered handler may add a topic this connection has not
      // yet subscribed to (or reintroduce one whose last handler just
      // unregistered elsewhere in the same tick) — resync immediately.
      sendCurrentTopicsRef.current()

      return () => {
        listeners?.delete(erased)
        sendCurrentTopicsRef.current()
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
