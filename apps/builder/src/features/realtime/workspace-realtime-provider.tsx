"use client"

import type { RealtimeEventData } from "@chatbotx.io/partysocket-config"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
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
import { z } from "zod"
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

/** Connection lifecycle of the single workspace socket — mirrors
 * `PartySocket`'s readyState, collapsed to the three states a subscriber
 * actually needs to react to. */
export type WorkspaceRealtimeConnectionStatus = "connecting" | "open" | "closed"

/**
 * Every event this build's `workspaces` party can emit, as a `Set` for O(1)
 * membership checks — the runtime counterpart of the `RealtimeEventName`
 * type, used to turn an arbitrary parsed string into that type WITHOUT a
 * cast.
 */
const KNOWN_REALTIME_EVENT_NAMES: ReadonlySet<string> = new Set(
  Object.values(RealtimeEventType),
)

/** Real type guard (no `as`) — narrows an arbitrary string coming out of a
 * parsed frame to `RealtimeEventName` only when this build actually knows
 * that event. A staggered deploy sending a newer event name this build
 * does not know about falls through here, not through a cast. */
function isKnownRealtimeEventName(value: string): value is RealtimeEventName {
  return KNOWN_REALTIME_EVENT_NAMES.has(value)
}

/** The wire envelope, validated BEFORE any property of the parsed JSON is
 * ever read — a frame that parses as valid JSON but is not an object with
 * these two keys (`null`, `1`, `[]`, `{}`, …) is rejected here rather than
 * risking a property access on a non-object. */
const realtimeEnvelopeSchema = z.object({
  eventType: z.string(),
  data: z.unknown(),
})

/**
 * A listener's real parameter type is `(event: RealtimeEvent<K>) => void`
 * for the specific `K` it registered under (see `subscribe` below). This
 * erased shape is what the registry actually stores, because a single
 * `Map`/`Set` cannot hold a distinct generic instantiation per entry.
 */
type ErasedRealtimeListener = (event: RealtimeEventData) => void

export type WorkspaceRealtimeSubscribe = <K extends RealtimeEventName>(
  eventType: K,
  listener: (event: RealtimeEvent<K>) => void,
) => () => void

type WorkspaceRealtimeContextValue = {
  /**
   * Registers one listener per name in `eventTypes`, each of which re-reads
   * `getHandlers()` on every dispatch — so a caller whose handler
   * identities change across renders (but not its set of subscribed event
   * names) always gets the latest handler without re-subscribing. See
   * `useWorkspaceRealtimeEvents`, the only intended caller.
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
 * Calls `handler` (looked up dynamically by `eventType` from a
 * `RealtimeHandlerMap`) with `event`, if `handler` is actually a function.
 *
 * This is one of the two places in `features/realtime/` that erase a
 * listener's specific `RealtimeEvent<K>` parameter type down to the
 * wire-level `RealtimeEventData` (the other is `subscribe`'s own
 * registration below). The erasure itself is sound because every caller
 * of this function looks up `handler` using the exact same `eventType`
 * string that `event` carries — the registration key and the dispatch key
 * are always the same value, so `event`'s `eventType` always matches what
 * `handler` was registered for, even though TypeScript cannot correlate a
 * dynamically-looked-up key with one specific union member at compile
 * time. This says nothing about whether `event.data` itself was validated
 * — see the comment where `dispatchedEvent` is built in `onMessage` for
 * that (only events with an entry in `REALTIME_EVENT_SCHEMAS` are).
 */
function invokeErasedHandler(handler: unknown, event: RealtimeEventData): void {
  if (typeof handler !== "function") {
    return
  }
  const erased = handler as ErasedRealtimeListener
  erased(event)
}

/**
 * The single owner of the workspace's realtime socket (`party: "workspaces"`)
 * — one connection per tab, mounted once around the whole workspace shell
 * (`app/space/[workspaceId]/layout.tsx`). Every feature subscribes through
 * {@link useWorkspaceRealtimeEvents} instead of opening its own connection;
 * nobody else may call `usePartySocket` for this party.
 *
 * Token minting is unchanged from the previous `ChatRealtime`-owned socket.
 * Dispatch pipeline for an incoming frame:
 * 1. `JSON.parse` — a parse failure is rate-limited-logged and dropped.
 * 2. Validate the wire ENVELOPE (`{ eventType: string, data: unknown }`) —
 *    a frame that isn't a matching object (`null`, `1`, `[]`, `{}`, …) is
 *    rate-limited-logged and dropped before any property is read off it.
 * 3. Narrow `eventType` to `RealtimeEventName` with a real type guard — an
 *    event this build does not know about (forward-compat across staggered
 *    deploys) is silently ignored, no warning.
 * 4. Look up listeners registered for that `eventType` — nobody subscribed
 *    is also silently ignored.
 * 5. Validate `data` against {@link REALTIME_EVENT_SCHEMAS} when a schema
 *    exists for that event — failure is rate-limited-logged and the event
 *    is NOT dispatched.
 * 6. Call every registered listener, each in its own try/catch — one
 *    listener throwing is logged (with `err` + `eventType`) and never
 *    stops the remaining listeners from receiving the event.
 */
export function WorkspaceRealtimeProvider({
  children,
}: {
  children: ReactNode
}) {
  const workspaceId = useWorkspaceId()
  const { wsUrl } = useTenantSettings()
  const listenersRef = useRef(
    new Map<RealtimeEventName, Set<ErasedRealtimeListener>>(),
  )
  const [status, setStatus] =
    useState<WorkspaceRealtimeConnectionStatus>("connecting")
  const [reconnectCount, setReconnectCount] = useState(0)
  const hasOpenedOnceRef = useRef(false)

  // React Strict Mode (dev only) double-invokes mount effects: setup,
  // cleanup, setup again — including `usePartySocket`'s own internal
  // effect. Without this, the SECOND synthetic mount's `onOpen` would see
  // `hasOpenedOnceRef.current` already `true` from the first (already
  // torn down) mount and misreport it as a reconnect. This cleanup runs
  // between the two synthetic mounts (and, harmlessly, on a real unmount),
  // resetting the flag exactly when Strict Mode's simulated remount needs
  // it reset.
  useEffect(
    () => () => {
      hasOpenedOnceRef.current = false
    },
    [],
  )

  const socket = usePartySocket({
    host: wsUrl,
    room: workspaceId,
    party: "workspaces",

    query: async () => {
      // Short-lived token bound to this member and workspace room — the
      // `workspaces` party rejects the upgrade for any other room.
      const { token } =
        await client.realtimeAPI.mintWorkspaceConnectTokenAuthenticatedAPI({
          workspaceId,
        })

      return { token }
    },

    onOpen: () => {
      if (hasOpenedOnceRef.current) {
        setReconnectCount((count) => count + 1)
      }
      hasOpenedOnceRef.current = true
      setStatus("open")
    },

    onClose: () => {
      setStatus("closed")
    },

    onMessage(event) {
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(event.data)
      } catch (error) {
        const decision = decideRealtimeWarnLogging("malformed-json", undefined)
        if (decision.shouldLog) {
          logger.warn(
            { err: error, suppressed: decision.isSuppressionSummary },
            decision.isSuppressionSummary
              ? "Workspace realtime: further malformed-JSON warnings suppressed for this window"
              : "Workspace realtime: could not parse message frame",
          )
        }
        return
      }

      const envelopeResult = realtimeEnvelopeSchema.safeParse(parsedJson)
      if (!envelopeResult.success) {
        const decision = decideRealtimeWarnLogging(
          "invalid-envelope",
          undefined,
        )
        if (decision.shouldLog) {
          logger.warn(
            {
              err: envelopeResult.error,
              suppressed: decision.isSuppressionSummary,
            },
            decision.isSuppressionSummary
              ? "Workspace realtime: further invalid-envelope warnings suppressed for this window"
              : "Workspace realtime: message frame is not a valid event envelope",
          )
        }
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
          const decision = decideRealtimeWarnLogging(
            "schema-invalid",
            eventType,
          )
          if (decision.shouldLog) {
            logger.warn(
              {
                err: result.error,
                eventType,
                suppressed: decision.isSuppressionSummary,
              },
              decision.isSuppressionSummary
                ? "Workspace realtime: further schema-validation warnings suppressed for this window"
                : "Workspace realtime: event failed schema validation",
            )
          }
          return
        }
      }

      // `eventType` has just been checked against every known
      // `RealtimeEventType` value, so it corresponds to SOME member of
      // `RealtimeEventData` — but TypeScript cannot correlate that
      // runtime-narrowed string with one specific union member at compile
      // time, so constructing the envelope still needs this assertion.
      // For an event with a schema in `REALTIME_EVENT_SCHEMAS`, `data` was
      // just validated against it above. For the rest — `messageCreated`
      // and `conversationCreated` (whose own type declares `data: unknown`
      // on purpose), plus `messageDeleted`, `messageIdAssigned`,
      // `messageUpdated`, `messageContentUpdated`, `messageFailed`,
      // `contactBlocked`/`contactUnblocked`, `conversationAssigned`,
      // `typing`, and `notifyExportResult` — `data` is typed but NOT
      // runtime-validated here, exactly as before this refactor (the
      // previous `ChatRealtime`-owned socket cast the whole parsed JSON to
      // `RealtimeEventData` with no validation at all). Narrowing every
      // one of those to a real schema is out of scope for this platform
      // move; each subscriber is responsible for trusting its own event's
      // shape, same as it always was.
      const dispatchedEvent = {
        eventType,
        data,
      } as unknown as RealtimeEventData

      for (const listener of listeners) {
        try {
          listener(dispatchedEvent)
        } catch (error) {
          // Keyed by `eventType` (already narrowed, so this key space is
          // bounded by `RealtimeEventType`) — a listener that throws on
          // every dispatch of one busy event never drowns out warnings
          // for an unrelated one.
          const decision = decideRealtimeWarnLogging(
            "listener-threw",
            eventType,
          )
          if (decision.shouldLog) {
            logger.warn(
              {
                err: error,
                eventType,
                suppressed: decision.isSuppressionSummary,
              },
              decision.isSuppressionSummary
                ? "Workspace realtime: further listener-threw warnings suppressed for this window"
                : "Workspace realtime: a listener threw while handling an event",
            )
          }
        }
      }
    },
  })

  // Presence keep-alive: a tiny ping frame over the ALREADY-OPEN
  // socket, on the SAME fixed cadence the realtime party reports presence
  // on (`PRESENCE_REPORT_INTERVAL_MS`, imported from the one place that
  // owns the pair so client and server can never drift). This is the
  // independent liveness signal a QUIET room otherwise lacks: an
  // already-open tab with no new connection and no inbound broadcast gives
  // the realtime party's report loop neither of its other two self-heal
  // triggers (`onConnect`, `onRequest`), so if its alarm silently stopped,
  // presence would expire even though tabs are still connected. The party's
  // `onMessage` handler treats this frame as a third trigger and re-arms
  // the loop only when it has actually gone stale — a no-op the rest of the
  // time, so this costs nothing beyond one websocket frame per tab per
  // interval. Deliberately NOT an HTTP request or server action — never
  // reintroduces the per-tab heartbeat cost this design replaced. Gated on
  // `status === "open"` so it only ever ticks while the socket is actually
  // connected, and the effect's cleanup (on close, reconnect, or unmount)
  // always clears the interval first.
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
      // Erasure boundary — see the module-level `invokeErasedHandler` doc
      // comment; the same soundness argument applies here: this listener
      // is only ever looked up and called under this exact `eventType`.
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

  // `subscribe` itself is intentionally NOT part of the exposed context
  // value — it is an internal primitive only `subscribeHandlers` (below)
  // needs; `useWorkspaceRealtimeEvents` (the only intended external
  // caller) goes through `subscribeHandlers`, never `subscribe` directly.
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
