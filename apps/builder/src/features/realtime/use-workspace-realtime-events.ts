"use client"

import { useEffect, useRef } from "react"
import type { RealtimeEventName, RealtimeHandlerMap } from "./types"
import { useWorkspaceRealtimeContext } from "./workspace-realtime-provider"

/**
 * Subscribes to a set of workspace realtime events for as long as the calling
 * component is mounted. `handlers` is read through a ref rather than
 * `useEffectEvent`, since `subscribeHandlers` calls the getter later from a
 * PartySocket callback, not synchronously inside a React Effect. Only the set of
 * event names drives the subscription effect's cleanup/re-run.
 */
export function useWorkspaceRealtimeEvents(handlers: RealtimeHandlerMap): void {
  const { subscribeHandlers } = useWorkspaceRealtimeContext()

  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  // Primitives compare by value, so this joined string is a stable dependency
  // for "the set of event names changed" — re-split inside the effect so its
  // dependency array stays exhaustive.
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
