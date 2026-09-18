"use client"

import { useEffect, useRef } from "react"
import type { RealtimeEventName, RealtimeHandlerMap } from "./types"
import { useWorkspaceRealtimeContext } from "./workspace-realtime-provider"

/**
 * Subscribes to a set of workspace realtime events for as long as the
 * calling component is mounted.
 *
 * `handlers` is read through a ref (`handlersRef`), refreshed by its own
 * small effect below — NOT a `useEffectEvent`. `subscribeHandlers` stores
 * the getter it's given and calls it later from `WorkspaceRealtimeProvider`'s
 * `onMessage` (a PartySocket message callback), which is not a call made
 * synchronously from inside a React Effect. React's own guidance restricts
 * Effect Events to exactly that call shape, so a ref updated by an effect
 * is used instead: `handlersRef.current` is always the handlers object from
 * the most recently committed render, and a handler changing identity
 * across renders (e.g. an inline closure capturing fresh props) is
 * dispatched correctly without re-subscribing, no stale closure. Only the
 * SET of event names subscribed to (`registeredEventTypesKey`) drives the
 * subscription effect's cleanup/re-run.
 *
 * The only type assertion in this file is the ordinary
 * `Object.keys(handlers) as RealtimeEventName[]` below (safe: every key of
 * a `RealtimeHandlerMap` is by construction a `RealtimeEventName`). The
 * place that erases a listener's typed `RealtimeEvent<K>` parameter down
 * to the wire shape is `WorkspaceRealtimeProvider`'s `subscribeHandlers`/
 * `invokeErasedHandler`, which this hook calls into.
 */
export function useWorkspaceRealtimeEvents(handlers: RealtimeHandlerMap): void {
  const { subscribeHandlers } = useWorkspaceRealtimeContext()

  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  // Primitives compare by value, so this joined string is a stable
  // dependency for "the SET of event names changed" — re-split inside the
  // effect below so the effect's own dependency array stays exhaustive
  // (every value it closes over is listed).
  const registeredEventTypesKey = (Object.keys(handlers) as RealtimeEventName[])
    .slice()
    .sort()
    .join(",")

  useEffect(() => {
    const eventTypes = registeredEventTypesKey
      .split(",")
      .filter(
        (eventType): eventType is RealtimeEventName => eventType.length > 0,
      )
    return subscribeHandlers(eventTypes, () => handlersRef.current)
  }, [subscribeHandlers, registeredEventTypesKey])
}
