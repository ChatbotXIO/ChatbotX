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
 * The wire envelope, validated before any property of the parsed JSON is read —
 * a frame that parses as JSON but isn't an object with these two keys is
 * rejected before any property access.
 */
const realtimeEnvelopeSchema = z.object({
  eventType: z.string(),
  data: z.unknown(),
})

/**
 * A listener's real parameter type is `(event: RealtimeEvent<K>) => void` for
 * the specific `K` it registered under. This erased shape is what the registry
 * stores, since a single `Map`/`Set` can't hold a distinct generic
 * instantiation per entry.
 */
type ErasedRealtimeListener = (event: RealtimeEventData) => void

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
