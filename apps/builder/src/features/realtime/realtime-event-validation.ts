import {
  contactInboxThreadControlUpdatedSchema,
  pipelineItemChangedSchema,
  RealtimeEventType,
  realtimeCallTransportEndedSchema,
  realtimeCallTransportIncomingSchema,
  realtimeCallTransportOutboundAnswerVoipSchema,
  realtimeCallTransportOutboundStatusVoipSchema,
  whatsappCallClaimedElsewhereSchema,
  whatsappCallPermissionUpdatedSchema,
} from "@chatbotx.io/realtime-protocol"
import type { z } from "zod"
import type { RealtimeEvent, RealtimeEventName } from "./types"

/**
 * Zod schemas for realtime event data that needs client-side validation. An
 * event with no entry here (e.g. `messageCreated`) keeps `data: unknown` in its
 * TS type — the provider dispatches it unvalidated and the subscriber is
 * responsible for narrowing it itself. Never invent a schema here that does not
 * already exist in `@chatbotx.io/realtime-protocol`.
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
  [RealtimeEventType.contactInboxThreadControlUpdated]:
    contactInboxThreadControlUpdatedSchema,
  [RealtimeEventType.pipelineItemChanged]: pipelineItemChangedSchema,
}
