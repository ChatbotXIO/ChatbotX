import type {
  RealtimeEventData,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"

/**
 * Channel-agnostic realtime platform. This module (and everything else under
 * `features/realtime/`) MUST NOT import chat or WhatsApp code — features
 * subscribe to it, it never subscribes to them.
 */

/** Every event name the `workspaces` party can emit, derived from the value
 * object `RealtimeEventType` rather than hand-listed, so a new event added
 * there is automatically a valid subscription key here. */
export type RealtimeEventName =
  (typeof RealtimeEventType)[keyof typeof RealtimeEventType]

/**
 * The concrete envelope ({ eventType, data }) for one event name. Not a plain
 * Extract<RealtimeEventData, { eventType: K }>: some union members (e.g.
 * RealtimeEventContactCommon) declare a union of literals for eventType,
 * which Extract would resolve to never for. This distributes over the union
 * instead.
 */
export type RealtimeEvent<K extends RealtimeEventName> =
  RealtimeEventData extends infer Event
    ? Event extends { eventType: infer EventType }
      ? K extends EventType
        ? Event
        : never
      : never
    : never

/** A feature's subscription: at most one handler per event name it cares
 * about. Passed to {@link useWorkspaceRealtimeEvents}. */
export type RealtimeHandlerMap = {
  readonly [K in RealtimeEventName]?: (event: RealtimeEvent<K>) => void
}
