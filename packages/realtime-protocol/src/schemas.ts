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
  conversationUpdated: "conversationUpdated",
  whatsappCallTransportIncoming: "whatsappCallTransportIncoming",
  whatsappCallTransportEnded: "whatsappCallTransportEnded",
  whatsappCallClaimedElsewhere: "whatsappCallClaimedElsewhere",
  whatsappCallOutboundAnswer: "whatsappCallOutboundAnswer",
  whatsappCallOutboundStatus: "whatsappCallOutboundStatus",
  whatsappCallPermissionUpdated: "whatsappCallPermissionUpdated",
  contactInboxThreadControlUpdated: "contactInboxThreadControlUpdated",
  pipelineItemChanged: "pipelineItemChanged",
} as const

type RealtimeEventTypeValue =
  (typeof RealtimeEventType)[keyof typeof RealtimeEventType]

type RealtimeEventDelivery = "conversation" | "workspace" | "targeted"

export const EVENT_DELIVERY = {
  [RealtimeEventType.messageCreated]: "conversation",
  [RealtimeEventType.messageDeleted]: "conversation",
  [RealtimeEventType.messageUpdated]: "conversation",
  [RealtimeEventType.messageContentUpdated]: "conversation",
  [RealtimeEventType.messageIdAssigned]: "conversation",
  [RealtimeEventType.messageFailed]: "conversation",
  [RealtimeEventType.typing]: "workspace",
  [RealtimeEventType.contactBlocked]: "workspace",
  [RealtimeEventType.contactUnblocked]: "workspace",
  [RealtimeEventType.conversationAssigned]: "conversation",
  [RealtimeEventType.conversationUpdated]: "conversation",
  [RealtimeEventType.whatsappCallTransportIncoming]: "targeted",
  [RealtimeEventType.whatsappCallTransportEnded]: "workspace",
  [RealtimeEventType.whatsappCallClaimedElsewhere]: "workspace",
  [RealtimeEventType.whatsappCallOutboundAnswer]: "targeted",
  [RealtimeEventType.whatsappCallOutboundStatus]: "targeted",
  [RealtimeEventType.whatsappCallPermissionUpdated]: "conversation",
  [RealtimeEventType.contactInboxThreadControlUpdated]: "workspace",
  [RealtimeEventType.pipelineItemChanged]: "workspace",
} as const satisfies Record<RealtimeEventTypeValue, RealtimeEventDelivery>

const guestRealtimeEventTypes = new Set<RealtimeEventTypeValue>([
  RealtimeEventType.messageCreated,
  RealtimeEventType.messageDeleted,
  RealtimeEventType.messageUpdated,
  RealtimeEventType.messageContentUpdated,
  RealtimeEventType.messageIdAssigned,
  RealtimeEventType.messageFailed,
  RealtimeEventType.typing,
])

type RealtimeEventTypesForDelivery<T extends RealtimeEventDelivery> = {
  [EventType in keyof typeof EVENT_DELIVERY]: (typeof EVENT_DELIVERY)[EventType] extends T
    ? EventType
    : never
}[keyof typeof EVENT_DELIVERY]

type ConversationScopedEventType = RealtimeEventTypesForDelivery<"conversation">
type TargetedOnlyEventType = RealtimeEventTypesForDelivery<"targeted">

const conversationScopedEventTypes = new Set(
  Object.entries(EVENT_DELIVERY)
    .filter(([, delivery]) => delivery === "conversation")
    .map(([eventType]) => eventType),
)
const targetedOnlyEventTypes = new Set(
  Object.entries(EVENT_DELIVERY)
    .filter(([, delivery]) => delivery === "targeted")
    .map(([eventType]) => eventType),
)

/**
 * Shared wire envelope validation. It intentionally validates only the
 * envelope; consumers validate event data against their event-specific schema.
 */

const realtimeEventRouteSchema = z.object({
  assignedTeamIds: z.array(z.string()).default([]),
  assignedUserIds: z.array(z.string()),
  inboxId: z.string().optional(),
})

export type RealtimeEventRoute = z.infer<typeof realtimeEventRouteSchema>

export const routeForConversation = (
  conversation:
    | {
        assignedInboxTeamId?: null | string
        assignedUserId?: null | string
        inboxId?: null | string
      }
    | null
    | undefined,
  inboxId?: null | string,
): RealtimeEventRoute => ({
  assignedTeamIds: conversation?.assignedInboxTeamId
    ? [conversation.assignedInboxTeamId]
    : [],
  assignedUserIds: conversation?.assignedUserId
    ? [conversation.assignedUserId]
    : [],
  ...((inboxId ?? conversation?.inboxId)
    ? { inboxId: inboxId ?? conversation?.inboxId ?? undefined }
    : {}),
})

export const routeForAssignment = ({
  assignedInboxTeamId,
  assignedUserId,
  previousAssignedInboxTeamIds,
  previousAssignedUserIds,
}: {
  assignedInboxTeamId?: null | string
  assignedUserId?: null | string
  previousAssignedInboxTeamIds?: (null | string | undefined)[]
  previousAssignedUserIds?: (null | string | undefined)[]
}): RealtimeEventRoute => ({
  assignedTeamIds: [
    ...new Set(
      [...(previousAssignedInboxTeamIds ?? []), assignedInboxTeamId].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ],
  assignedUserIds: [
    ...new Set(
      [...(previousAssignedUserIds ?? []), assignedUserId].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ],
})
/**
 * Bare envelope shape, shared by every delivery kind (workspace broadcast,
 * guest-targeted, member-targeted). Intentionally unrefined: a guest- or
 * member-targeted record is never filtered by `route`, so it correctly never
 * carries one even for an otherwise conversation-scoped event type — only
 * `realtimeWorkspaceEventEnvelopeSchema` below enforces the route-required
 * rule, scoped to the one delivery kind it actually applies to.
 */
export const realtimeEventEnvelopeSchema = z.object({
  eventType: z.enum(RealtimeEventType),
  data: z.unknown(),
  route: realtimeEventRouteSchema.optional(),
})
export type RealtimeEventEnvelope = z.infer<typeof realtimeEventEnvelopeSchema>

/**
 * Workspace-broadcast-only envelope validation.
 */
export const realtimeWorkspaceEventEnvelopeSchema =
  realtimeEventEnvelopeSchema.superRefine((envelope, ctx) => {
    if (targetedOnlyEventTypes.has(envelope.eventType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${envelope.eventType}" is targeted-only and cannot be workspace-broadcast`,
        path: ["eventType"],
      })
    }
    if (
      conversationScopedEventTypes.has(envelope.eventType) &&
      !envelope.route
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${envelope.eventType}" is conversation-scoped and requires a route`,
        path: ["route"],
      })
    }
  })

const STREAM_ID_PATTERN = /^\d+-\d+$/
const realtimeStreamIdSchema = z.string().regex(STREAM_ID_PATTERN)

const batchOf = <T extends z.ZodType>(eventSchema: T) =>
  z.object({
    batch: z.array(eventSchema),
    seq: realtimeStreamIdSchema,
  })

export const realtimeBatchEnvelopeSchema = batchOf(
  realtimeWorkspaceEventEnvelopeSchema,
)

/**
 * A member is already pinned to one recipient, so targeted-only events are
 * valid even though workspace-wide readers must reject them.
 */
export const realtimeMemberBatchEnvelopeSchema = batchOf(
  realtimeEventEnvelopeSchema,
)

/**
 * Guest-socket delivery is never route-filtered, but guests only receive
 * message updates and their own ephemeral typing signal.
 */
export const realtimeGuestEventEnvelopeSchema =
  realtimeEventEnvelopeSchema.refine(
    (event) => guestRealtimeEventTypes.has(event.eventType),
    {
      message: "Event type is not allowed for guest delivery",
      path: ["eventType"],
    },
  )

export const realtimeGuestBatchEnvelopeSchema = batchOf(
  realtimeGuestEventEnvelopeSchema,
)

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
   * workspace audience.
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
 * reconciled into a local grant with no inbound message to invalidate.
 * Conversation-scoped: only whoever is assigned to (or has full-scope access
 * to) this conversation needs it, unlike a ringing/active call's workspace-wide
 * broadcast.
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
 * snapshot older than the one it holds. Broadcast to the workspace audience.
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

/**
 * A pipeline board changed. Carries ids only (never item content), so the
 * client refetches through its authorised read instead of trusting the event.
 * `itemId` is omitted for a bulk change that touched many items.
 */
export const pipelineItemChangedSchema = z.object({
  pipelineId: z.string(),
  itemId: z.string().optional(),
  /** The item's contact, so per-contact views (inbox panel) refetch only for it. */
  contactId: z.string().optional(),
  change: z.enum(["created", "updated", "moved", "deleted", "bulk"]),
})
export type PipelineItemChangedData = z.infer<typeof pipelineItemChangedSchema>

export type RealtimeEventPipelineItemChanged = {
  eventType: typeof RealtimeEventType.pipelineItemChanged
  data: PipelineItemChangedData
}

type AllRealtimeEventData =
  | RealtimeEventCreateMessage
  | RealtimeEventMessageDeleted
  | RealtimeEventMessageIdAssigned
  | RealtimeEventMessageUpdated
  | RealtimeEventMessageContentUpdated
  | RealtimeEventMessageFailed
  | RealtimeEventTyping
  | RealtimeEventContactCommon
  | RealtimeEventConversationAssigned
  | RealtimeEventConversationUpdated
  | RealtimeEventWhatsappCallTransportIncoming
  | RealtimeEventWhatsappCallTransportEnded
  | RealtimeEventWhatsappCallClaimedElsewhere
  | RealtimeEventWhatsappCallOutboundAnswer
  | RealtimeEventWhatsappCallOutboundStatus
  | RealtimeEventWhatsappCallPermissionUpdated
  | RealtimeEventContactInboxThreadControlUpdated
  | RealtimeEventPipelineItemChanged

type RealtimeConversationScopedEventData = Extract<
  AllRealtimeEventData,
  { eventType: ConversationScopedEventType }
>
type RealtimeWorkspaceBroadcastEventData = Extract<
  AllRealtimeEventData,
  { eventType: RealtimeEventTypesForDelivery<"workspace"> }
>
type RealtimeTargetedOnlyEventData = Extract<
  AllRealtimeEventData,
  { eventType: TargetedOnlyEventType }
>

type Routed<T> = T extends unknown ? T & { route: RealtimeEventRoute } : never
type MaybeRouted<T> = T extends unknown
  ? T & { route?: RealtimeEventRoute }
  : never

export type RealtimeEventData =
  | Routed<RealtimeConversationScopedEventData>
  | MaybeRouted<RealtimeWorkspaceBroadcastEventData>

/**
 * A guest conversation or one member is already pinned to the recipient, so
 * route is optional for every targeted event.
 */
export type RealtimeTargetedEventData = MaybeRouted<
  | RealtimeConversationScopedEventData
  | RealtimeTargetedOnlyEventData
  | RealtimeWorkspaceBroadcastEventData
>

type RealtimeGuestMessageEventType =
  | typeof RealtimeEventType.messageCreated
  | typeof RealtimeEventType.messageDeleted
  | typeof RealtimeEventType.messageUpdated
  | typeof RealtimeEventType.messageContentUpdated
  | typeof RealtimeEventType.messageIdAssigned
  | typeof RealtimeEventType.messageFailed

type RealtimeGuestMessageEventData = Extract<
  AllRealtimeEventData,
  { eventType: RealtimeGuestMessageEventType }
>

type Assert<T extends true> = T
type RealtimeEventDataMatchesDelivery = [
  AllRealtimeEventData["eventType"],
] extends [keyof typeof EVENT_DELIVERY]
  ? [keyof typeof EVENT_DELIVERY] extends [AllRealtimeEventData["eventType"]]
    ? true
    : false
  : false
export type RealtimeEventDataMatchesDeliveryAssertion =
  Assert<RealtimeEventDataMatchesDelivery>

export type RealtimeGuestEventData =
  | MaybeRouted<RealtimeGuestMessageEventData>
  | {
      eventType: typeof RealtimeEventType.typing
      data: { typing: boolean }
    }
