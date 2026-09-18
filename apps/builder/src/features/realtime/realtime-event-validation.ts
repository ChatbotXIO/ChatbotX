import {
  RealtimeEventType,
  realtimeCallTransportEndedSchema,
  realtimeCallTransportIncomingSchema,
  realtimeCallTransportOutboundAnswerVoipSchema,
  realtimeCallTransportOutboundStatusVoipSchema,
  whatsappCallClaimedElsewhereSchema,
  whatsappCallPermissionUpdatedSchema,
} from "@chatbotx.io/partysocket-config"
import type { z } from "zod"
import type { RealtimeEvent, RealtimeEventName } from "./types"

/**
 * Zod schemas for every event `partysocket-config` already validates
 * server-side. An event with no entry here (e.g. `messageCreated`) keeps
 * `data: unknown` in its TS type — the provider dispatches it unvalidated
 * and the subscriber is responsible for narrowing it itself. Never invent a
 * schema here that does not already exist in `partysocket-config`.
 */
export const REALTIME_EVENT_SCHEMAS: {
  readonly [K in RealtimeEventName]?: z.ZodType<RealtimeEvent<K>["data"]>
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
