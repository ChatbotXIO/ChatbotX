import {
  RealtimeEventType,
  realtimeCallTransportEndedSchema,
  realtimeCallTransportIncomingSchema,
  realtimeCallTransportOutboundAnswerVoipSchema,
  realtimeCallTransportOutboundStatusVoipSchema,
  whatsappCallClaimedElsewhereSchema,
  whatsappCallPermissionUpdatedSchema,
} from "@chatbotx.io/realtime-protocol"
import type { RealtimeEvent, RealtimeEventName } from "./types"

type RealtimeDataSchema<Data> = {
  safeParse: (
    input: unknown,
  ) => { success: true; data: Data } | { success: false; error: unknown }
}

/**
 * Zod schemas that realtime-protocol already validates server-side. An event
 * with no entry here (e.g. `messageCreated`) keeps `data: unknown` in its TS
 * type — the provider dispatches it unvalidated and the subscriber is
 * responsible for narrowing it itself. Never invent a schema here that does
 * not already exist in realtime-protocol.
 */
export const REALTIME_EVENT_SCHEMAS: {
  readonly [K in RealtimeEventName]?: RealtimeDataSchema<
    RealtimeEvent<K>["data"]
  >
} = {
  [RealtimeEventType.whatsappCallTransportIncoming]:
    realtimeCallTransportIncomingSchema,
  [RealtimeEventType.whatsappCallTransportEnded]:
    realtimeCallTransportEndedSchema,
  [RealtimeEventType.whatsappCallClaimedElsewhere]:
    whatsappCallClaimedElsewhereSchema,
  [RealtimeEventType.whatsappCallOutboundAnswer]:
    realtimeCallTransportOutboundAnswerVoipSchema,
  [RealtimeEventType.whatsappCallOutboundStatus]:
    realtimeCallTransportOutboundStatusVoipSchema,
  [RealtimeEventType.whatsappCallPermissionUpdated]:
    whatsappCallPermissionUpdatedSchema,
}
