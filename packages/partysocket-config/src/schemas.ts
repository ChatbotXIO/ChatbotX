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
  contactInboxThreadControlUpdated: "contactInboxThreadControlUpdated",
} as const

export const RealtimeTopic = {
  chat: "chat",
  voip: "voip",
} as const

export type RealtimeTopic = (typeof RealtimeTopic)[keyof typeof RealtimeTopic]

export const RealtimeProtocol = {
  v1: "v1",
  v2: "v2",
} as const

export const realtimeProtocolSchema = z.enum(RealtimeProtocol)
export type RealtimeProtocol = z.infer<typeof realtimeProtocolSchema>

/**
 * A zero-interest relay response suppresses ephemeral typing traffic for this
 * long. Durable events always continue to the relay.
 */
export const REALTIME_DELIVERY_NEGATIVE_TTL_MS = 2000

export type RealtimeEventTopicDefinition = {
  durability: "durable" | "ephemeral"
  topics: readonly RealtimeTopic[]
}

export const REALTIME_EVENT_TOPICS: {
  readonly [K in (typeof RealtimeEventType)[keyof typeof RealtimeEventType]]: RealtimeEventTopicDefinition
} = {
  [RealtimeEventType.messageCreated]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.messageDeleted]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.messageUpdated]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.messageContentUpdated]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.messageIdAssigned]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.messageFailed]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.typing]: {
    durability: "ephemeral",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.contactBlocked]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.contactUnblocked]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.conversationAssigned]: {
    durability: "durable",
    topics: [RealtimeTopic.chat, RealtimeTopic.voip],
  },
  [RealtimeEventType.notifyExportResult]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.conversationCreated]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.conversationUpdated]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
  [RealtimeEventType.whatsappCallTransportIncoming]: {
    durability: "durable",
    topics: [RealtimeTopic.voip],
  },
  [RealtimeEventType.whatsappCallTransportEnded]: {
    durability: "durable",
    topics: [RealtimeTopic.voip],
  },
  [RealtimeEventType.whatsappCallClaimedElsewhere]: {
    durability: "durable",
    topics: [RealtimeTopic.voip],
  },
  [RealtimeEventType.whatsappCallOutboundAnswer]: {
    durability: "durable",
    topics: [RealtimeTopic.voip],
  },
  [RealtimeEventType.whatsappCallOutboundStatus]: {
    durability: "durable",
    topics: [RealtimeTopic.voip],
  },
  [RealtimeEventType.whatsappCallPermissionUpdated]: {
    durability: "durable",
    topics: [RealtimeTopic.voip],
  },
  [RealtimeEventType.contactInboxThreadControlUpdated]: {
    durability: "durable",
    topics: [RealtimeTopic.chat],
  },
}

/**
 * Shared wire envelope validation. It intentionally validates only the
 * envelope; consumers validate event data against their event-specific schema.
 */
export const realtimeEventEnvelopeSchema = z.object({
  eventType: z.string(),
  data: z.unknown(),
})
export type RealtimeEventEnvelope = z.infer<typeof realtimeEventEnvelopeSchema>

export const realtimeBatchEnvelopeSchema = z.object({
  batch: z.array(realtimeEventEnvelopeSchema),
})

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

/**
 * A conversation thread's routing owner changed (conversation routing / thread
 * control). Carries the same snapshot the take/release/pass action returns, so
 * a client patches the matching contact inbox without a refetch and ignores a
 * snapshot older than the one it holds. Broadcast to the workspace room.
 */
export const contactInboxThreadControlUpdatedSchema = z.object({
  conversationId: z.string(),
  contactInboxId: z.string(),
  threadControlState: z.enum(["owned", "standby", "idle"]).nullable(),
  threadOwnerRole: z.string().nullable(),
  /**
   * Owner app id for channels that name owners by app id. Optional so an
   * older publisher (or a role-based channel) stays valid.
   */
  threadOwnerAppId: z.string().nullable().optional(),
  /** ISO-8601 of the last applied transition; null when never observed. */
  threadControlUpdatedAt: z.string().nullable(),
  /** ISO-8601 expiry of a standby thread (Messenger); optional for older publishers. */
  threadOwnerExpiresAt: z.string().nullable().optional(),
  /**
   * The event that produced the state; clients use it to break a tie between
   * two snapshots of the same second, with the server's precedence order.
   */
  threadControlLastEvent: z.string().nullable(),
})
export type ContactInboxThreadControlUpdatedData = z.infer<
  typeof contactInboxThreadControlUpdatedSchema
>

export type RealtimeEventContactInboxThreadControlUpdated = {
  eventType: typeof RealtimeEventType.contactInboxThreadControlUpdated
  data: ContactInboxThreadControlUpdatedData
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
  | RealtimeEventContactInboxThreadControlUpdated
