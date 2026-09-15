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
  conversationCreated: "conversationCreated",
  conversationUpdated: "conversationUpdated",
  whatsappCallTransportIncoming: "whatsappCallTransportIncoming",
  whatsappCallTransportEnded: "whatsappCallTransportEnded",
  whatsappCallClaimedElsewhere: "whatsappCallClaimedElsewhere",
  whatsappCallOutboundAnswer: "whatsappCallOutboundAnswer",
  whatsappCallOutboundStatus: "whatsappCallOutboundStatus",
  whatsappCallPermissionUpdated: "whatsappCallPermissionUpdated",
} as const

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
 * A generic `contentAttributes` patch on an existing message, keyed by its
 * DB id (never `sourceId` — that's a worker-only lookup key). Distinct from
 * `messageUpdated` (which carries the edit-comment-specific text/attachment
 * fields): this event is for enriching an activity message's structured
 * payload after the fact — e.g. attaching a call transcript once
 * transcription completes — without ever inserting a duplicate message.
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
 * An inbound call is ringing for the reserved agent. A call is identified by
 * `whatsappCallId` (the `WhatsappCall` row id) plus `wacid` (Meta's call id).
 * `transport` is retained as a literal so existing clients keep parsing the
 * payload unchanged; browser WebRTC is the only transport.
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
   * exclusively to the reserved agent's own connections, never broadcast to
   * the workspace room.
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
 * Broadcast to the whole workspace (not a targeted send, unlike the offer in
 * `whatsappCallTransportIncoming`) so every OTHER rung agent's ringing
 * dialog clears immediately instead of waiting out the answer deadline.
 * `answeredByUserId` lets the winning agent's own client ignore its own
 * event (it already knows it won).
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
 * The user's SDP ANSWER to a business-initiated (outbound) VoIP call,
 * delivered asynchronously via Meta's webhook and forwarded here. Keyed by
 * `attemptId` (not just `wacid`) because the answer can race the `connect`
 * POST response — the initiating client may not have `wacid` yet when this
 * arrives. TARGETED-SEND-ONLY: this event carries the live SDP answer and
 * must be delivered exclusively to the initiating agent's own connections
 * (never broadcast to the workspace room), exactly like the inbound offer in
 * `realtimeCallTransportIncomingVoipSchema` above — and, like that offer,
 * the SDP inside it must NEVER be logged.
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
 * Meta's RINGING/ACCEPTED status webhooks for a business-initiated (outbound)
 * call, forwarded live so the initiating agent's browser can drive its call
 * UI from the callee's actual phone state instead of `pc.connectionState`
 * (which can report "connected" while the callee's phone is still ringing).
 * TARGETED-SEND-ONLY: delivered exclusively to the initiating agent's own
 * connections via `sendToWorkspaceMember`, never broadcast to the workspace
 * room — same delivery contract as `whatsappCallOutboundAnswer` above. This
 * event carries no SDP.
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
 * A conversation's WhatsApp call-permission state changed OUTSIDE the
 * `call_permission_reply` webhook path — specifically when a
 * `call_permission_request` send returns Meta 138017 (the consumer already
 * granted a permanent permission), which the chat worker reconciles into a
 * local grant with no inbound message to hang an invalidation off of. This
 * event tells every open thread to refetch `useOutboundCallMode` so the
 * header's call control flips from "request permission" to direct-dial live,
 * instead of waiting out the query's `staleTime` or a remount. Carries no
 * permission detail — the client re-resolves from the server as the single
 * source of truth. Broadcast to the workspace room (a client only acts on the
 * matching `conversationId`).
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
