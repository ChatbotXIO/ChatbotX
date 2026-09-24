import { z } from "zod"

export const RealtimeEventType = {
  messageCreated: "messageCreated",
  messageDeleted: "messageDeleted",
  messageUpdated: "messageUpdated",
  messageContentUpdated: "messageContentUpdated",
  messageIdAssigned: "messageIdAssigned",
  messageFailed: "messageFailed",
  typing: "typing",
  contactBlocked: "contactBlocked",
  contactUnblocked: "contactUnblocked",
  conversationAssigned: "conversationAssigned",
  notifyExportResult: "notifyExportResult",
  conversationUpdated: "conversationUpdated",
  // Reserved for wire compatibility; servers no longer emit this event.
  conversationCreated: "conversationCreated",
  whatsappCallTransportIncoming: "whatsappCallTransportIncoming",
  whatsappCallTransportEnded: "whatsappCallTransportEnded",
  whatsappCallClaimedElsewhere: "whatsappCallClaimedElsewhere",
  whatsappCallOutboundAnswer: "whatsappCallOutboundAnswer",
  whatsappCallOutboundStatus: "whatsappCallOutboundStatus",
  whatsappCallPermissionUpdated: "whatsappCallPermissionUpdated",
} as const

export const RealtimeTopic = {
  chat: "chat",
  voip: "voip",
} as const

export type RealtimeTopic = (typeof RealtimeTopic)[keyof typeof RealtimeTopic]

export type RealtimeProtocol = "v1" | "v2"

/**
 * A zero-interest relay response suppresses chat-only publisher traffic for
 * this long. The builder imports the same value when scheduling its trailing
 * subscription-state resync, so the two sides cannot drift.
 */
export const REALTIME_DELIVERY_NEGATIVE_TTL_MS = 2000

export const REALTIME_EVENT_TOPICS: {
  readonly [K in (typeof RealtimeEventType)[keyof typeof RealtimeEventType]]: readonly RealtimeTopic[]
} = {
  [RealtimeEventType.messageCreated]: [RealtimeTopic.chat],
  [RealtimeEventType.messageDeleted]: [RealtimeTopic.chat],
  [RealtimeEventType.messageUpdated]: [RealtimeTopic.chat],
  [RealtimeEventType.messageContentUpdated]: [RealtimeTopic.chat],
  [RealtimeEventType.messageIdAssigned]: [RealtimeTopic.chat],
  [RealtimeEventType.messageFailed]: [RealtimeTopic.chat],
  [RealtimeEventType.typing]: [RealtimeTopic.chat],
  [RealtimeEventType.contactBlocked]: [RealtimeTopic.chat],
  [RealtimeEventType.contactUnblocked]: [RealtimeTopic.chat],
  [RealtimeEventType.conversationAssigned]: [
    RealtimeTopic.chat,
    RealtimeTopic.voip,
  ],
  [RealtimeEventType.notifyExportResult]: [RealtimeTopic.chat],
  [RealtimeEventType.conversationCreated]: [RealtimeTopic.chat],
  [RealtimeEventType.conversationUpdated]: [RealtimeTopic.chat],
  [RealtimeEventType.whatsappCallTransportIncoming]: [RealtimeTopic.voip],
  [RealtimeEventType.whatsappCallTransportEnded]: [RealtimeTopic.voip],
  [RealtimeEventType.whatsappCallClaimedElsewhere]: [RealtimeTopic.voip],
  [RealtimeEventType.whatsappCallOutboundAnswer]: [RealtimeTopic.voip],
  [RealtimeEventType.whatsappCallOutboundStatus]: [RealtimeTopic.voip],
  [RealtimeEventType.whatsappCallPermissionUpdated]: [RealtimeTopic.voip],
}

export const realtimeSubscriptionMessageSchema = z.object({
  type: z.literal("subscribe"),
  // Repeats are accepted and de-duplicated by the Party; keeping a small
  // frame bound still prevents untrusted websocket clients from sending an
  // arbitrarily large topic array.
  topics: z.array(z.enum(RealtimeTopic)).max(16),
})

export type RealtimeSubscriptionMessage = z.infer<
  typeof realtimeSubscriptionMessageSchema
>

export const serializeRealtimeSubscriptionMessage = (
  topics: readonly RealtimeTopic[],
): string =>
  JSON.stringify({
    type: "subscribe",
    topics: [...topics],
  } satisfies RealtimeSubscriptionMessage)

export type RealtimeEventCreateMessage = {
  eventType: typeof RealtimeEventType.messageCreated
  data: unknown
}

export type RealtimeEventMessageDeleted = {
  eventType: typeof RealtimeEventType.messageDeleted
  data: {
    messageIds: string[]
  }
}

export type RealtimeEventMessageIdAssigned = {
  eventType: typeof RealtimeEventType.messageIdAssigned
  data: {
    messageId: string
    commentId: string
  }
}

export type RealtimeEventMessageUpdated = {
  eventType: typeof RealtimeEventType.messageUpdated
  data: {
    messageId: string
    newText: string
    newAttachmentPath?: string | null
    newAttachmentPublicUrl?: string | null
    newAttachmentMimeType?: string | null
    newAttachmentWidth?: number
    newAttachmentHeight?: number
    removedAttachment?: boolean
  }
}

/**
 * A generic `contentAttributes` patch on an existing message, keyed by its DB
 * id (never `sourceId`, a worker-only lookup key). Distinct from
 * `messageUpdated`: this enriches an activity message's structured payload
 * after the fact — e.g. attaching a call transcript once transcription
 * completes — without inserting a duplicate message.
 */
export type RealtimeEventMessageContentUpdated = {
  eventType: typeof RealtimeEventType.messageContentUpdated
  data: {
    messageId: string
    contentAttributes: Record<string, unknown>
  }
}

export type RealtimeEventMessageFailed = {
  eventType: typeof RealtimeEventType.messageFailed
  data: {
    messageId: string
    clientId?: string
    error: string | null
  }
}

export type RealtimeEventTyping = {
  eventType: typeof RealtimeEventType.typing
  data: {
    conversationId: string
    typing: boolean
    seconds: number
  }
}

export type RealtimeEventContactCommon = {
  eventType:
    | typeof RealtimeEventType.contactBlocked
    | typeof RealtimeEventType.contactUnblocked
  data: {
    contactId: string
  }
}

export type RealtimeEventConversationAssigned = {
  eventType: typeof RealtimeEventType.conversationAssigned
  data: {
    conversationIds: string[]
    assignedUserId: string | null
    assignedInboxTeamId: string | null
  }
}

export type RealtimeEventNotifyExportResult = {
  eventType: typeof RealtimeEventType.notifyExportResult
  data: {
    outputPath: string
    status: "pending" | "processing" | "completed" | "failed"
    error?: string
  }
}

export type RealtimeEventConversationCreated = {
  eventType: typeof RealtimeEventType.conversationCreated
  // Full conversation row — shape owned by @chatbotx.io/business's
  // ConversationModel; kept as `unknown` here to avoid a dependency from this
  // package (imported client-side) on the database schema package.
  data: unknown
}

export type RealtimeEventConversationUpdatedChanges = {
  archivedAt?: string | null
  assignedUserId?: string | null
  assignedInboxTeamId?: string | null
  followed?: boolean
  agentLastReadAt?: string | null
  botEnabled?: boolean
}

export type RealtimeEventConversationUpdated = {
  eventType: typeof RealtimeEventType.conversationUpdated
  data: {
    conversationIds: string[]
    changes: RealtimeEventConversationUpdatedChanges
  }
}

const realtimeCallDirectionSchema = z.enum([
  "userInitiated",
  "businessInitiated",
])

const realtimeCallEndedStatusSchema = z.enum([
  "completed",
  "rejected",
  "failed",
])

/**
 * An inbound call is ringing for the reserved agent. Identified by
 * `whatsappCallId` (the `WhatsappCall` row id) plus `wacid` (Meta's call id).
 * `transport` is a literal so existing clients keep parsing the payload
 * unchanged; browser WebRTC is the only transport.
 */
export const realtimeCallTransportIncomingSchema = z.object({
  transport: z.literal("voip"),
  whatsappCallId: z.string(),
  wacid: z.string(),
  direction: realtimeCallDirectionSchema,
  conversationId: z.string(),
  contactInboxId: z.string(),
  contactName: z.string().nullable().optional(),
  /**
   * The SDP offer — safe to include here ONLY because this event is sent
   * exclusively to the reserved agent's own connections, never broadcast to the
   * workspace room.
   */
  offer: z.object({
    sdpType: z.literal("offer"),
    sdp: z.string(),
  }),
  deadlineAt: z.string(),
})

export type RealtimeCallTransportIncoming = z.infer<
  typeof realtimeCallTransportIncomingSchema
>

/** The call reached a terminal status — dismiss the call UI. */
export const realtimeCallTransportEndedSchema = z.object({
  transport: z.literal("voip"),
  whatsappCallId: z.string(),
  wacid: z.string(),
  status: realtimeCallEndedStatusSchema,
})
export type RealtimeCallTransportEnded = z.infer<
  typeof realtimeCallTransportEndedSchema
>

/** Emitter/consumer-facing envelope for the incoming (ringing/offer) event. */
export type RealtimeEventWhatsappCallTransportIncoming = {
  eventType: typeof RealtimeEventType.whatsappCallTransportIncoming
  data: RealtimeCallTransportIncoming
}

/** Emitter/consumer-facing envelope for the transport-tagged ended event. */
export type RealtimeEventWhatsappCallTransportEnded = {
  eventType: typeof RealtimeEventType.whatsappCallTransportEnded
  data: RealtimeCallTransportEnded
}

/**
 * A VoIP call was claimed (answered) by one of the ring-all rung agents.
 * Broadcast to the whole workspace (unlike the targeted offer in
 * `whatsappCallTransportIncoming`) so every other rung agent's ringing dialog
 * clears immediately instead of waiting out the answer deadline.
 * `answeredByUserId` lets the winning agent's own client ignore its own event.
 */
export const whatsappCallClaimedElsewhereSchema = z.object({
  whatsappCallId: z.string(),
  wacid: z.string(),
  answeredByUserId: z.string(),
})
export type WhatsappCallClaimedElsewhereData = z.infer<
  typeof whatsappCallClaimedElsewhereSchema
>

export type RealtimeEventWhatsappCallClaimedElsewhere = {
  eventType: typeof RealtimeEventType.whatsappCallClaimedElsewhere
  data: WhatsappCallClaimedElsewhereData
}

/**
 * The user's SDP ANSWER to an outbound call, forwarded from Meta's webhook.
 * Keyed by `attemptId` (not just `wacid`) because the answer can race the
 * `connect` POST response. TARGETED-SEND-ONLY: never broadcast, never logged.
 */
export const realtimeCallTransportOutboundAnswerVoipSchema = z.object({
  whatsappCallId: z.string(),
  wacid: z.string(),
  attemptId: z.string(),
  session: z.object({
    sdpType: z.literal("answer"),
    sdp: z.string(),
  }),
})
export type WhatsappCallOutboundAnswerData = z.infer<
  typeof realtimeCallTransportOutboundAnswerVoipSchema
>

export type RealtimeEventWhatsappCallOutboundAnswer = {
  eventType: typeof RealtimeEventType.whatsappCallOutboundAnswer
  data: WhatsappCallOutboundAnswerData
}

/**
 * Meta's RINGING/ACCEPTED status webhooks for an outbound call, forwarded live
 * so the browser can drive call UI from the callee's actual phone state
 * instead of `pc.connectionState` (can report "connected" while still
 * ringing). TARGETED-SEND-ONLY, same contract as `whatsappCallOutboundAnswer`.
 */
export const realtimeCallTransportOutboundStatusVoipSchema = z.object({
  whatsappCallId: z.string(),
  wacid: z.string(),
  attemptId: z.string(),
  status: z.enum(["ringing", "accepted"]),
})
export type WhatsappCallOutboundStatusData = z.infer<
  typeof realtimeCallTransportOutboundStatusVoipSchema
>

export type RealtimeEventWhatsappCallOutboundStatus = {
  eventType: typeof RealtimeEventType.whatsappCallOutboundStatus
  data: WhatsappCallOutboundStatusData
}

/**
 * Fires when Meta 138017 (consumer already granted permanent permission) is
 * reconciled into a local grant with no inbound message to invalidate on.
 * Tells open threads to refetch `useOutboundCallMode`; carries no permission
 * detail. Broadcast to the workspace room.
 */
export const whatsappCallPermissionUpdatedSchema = z.object({
  conversationId: z.string(),
})
export type WhatsappCallPermissionUpdatedData = z.infer<
  typeof whatsappCallPermissionUpdatedSchema
>

export type RealtimeEventWhatsappCallPermissionUpdated = {
  eventType: typeof RealtimeEventType.whatsappCallPermissionUpdated
  data: WhatsappCallPermissionUpdatedData
}

export type RealtimeEventData =
  | RealtimeEventCreateMessage
  | RealtimeEventMessageDeleted
  | RealtimeEventMessageIdAssigned
  | RealtimeEventMessageUpdated
  | RealtimeEventMessageContentUpdated
  | RealtimeEventMessageFailed
  | RealtimeEventContactCommon
  | RealtimeEventConversationAssigned
  | RealtimeEventTyping
  | RealtimeEventNotifyExportResult
  | RealtimeEventConversationCreated
  | RealtimeEventConversationUpdated
  | RealtimeEventWhatsappCallTransportIncoming
  | RealtimeEventWhatsappCallTransportEnded
  | RealtimeEventWhatsappCallClaimedElsewhere
  | RealtimeEventWhatsappCallOutboundAnswer
  | RealtimeEventWhatsappCallOutboundStatus
  | RealtimeEventWhatsappCallPermissionUpdated
