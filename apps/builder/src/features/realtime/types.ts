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
 * The concrete envelope (`{ eventType, data }`) for one event name, picked
 * out of the `RealtimeEventData` discriminated union.
 *
 * NOT a plain `Extract<RealtimeEventData, { eventType: K }>`: a couple of
 * union members (e.g. `RealtimeEventContactCommon`, whose `eventType` is
 * `"contactBlocked" | "contactUnblocked"`) declare a UNION of literals for
 * `eventType` rather than a single one. `Extract` requires the member to be
 * assignable to `{ eventType: K }`, which such a member never is (its
 * `eventType` is wider than the single literal `K`) — it would silently
 * resolve to `never` for those events, exactly like a `switch` on
 * `eventType` still correctly narrows to that member for either of its
 * literals. This distributes over the union and keeps a member whenever `K`
 * is ONE OF its declared `eventType` literals, matching that narrowing.
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
