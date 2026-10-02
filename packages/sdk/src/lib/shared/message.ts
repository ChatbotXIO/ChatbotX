import type { ButtonPayload } from "@chatbotx.io/flow-config"
import { z } from "zod"
import type { ChannelError } from "../channel-error"

export type IncomingContact = {
  sourceId: string
  sourceConversationId?: string
  phoneNumber?: string
  phoneNumberId?: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
  gender?: string
  locale?: string
  language?: string
  timezone?: string
  /**
   * Alternate stable channel-scoped user id, independent of `sourceId`
   * (e.g. WhatsApp Business-Scoped User ID). Channel-agnostic name — see
   * `ContactInbox.sourceUserId`.
   */
  sourceUserId?: string
  /**
   * Parent channel-scoped user id used only as an identity matching fallback.
   * Never use this value to address outbound messages.
   */
  sourceParentUserId?: string
  /**
   * Channel handle/username for this contact (e.g. WhatsApp `@username`).
   * Display-only, never used as a matching key.
   */
  sourceUsername?: string
  /**
   * The channel's own conversation identifier, for channels that require one to
   * address an outbound DM (TikTok's `conversation_id`). Stored on
   * `Conversation.additionalAttributes.channelConversationId` — deliberately NOT
   * `sourceConversationId`, which keys the conversation row and is reserved for
   * comment threads (the post id). Keeping the two apart is what lets a channel
   * have both a DM and comment threads for the same contact; see
   * `packages/database/src/partials/channel.ts`.
   */
  channelConversationId?: string
}

/** The channel-scoped identity slice shared by contact-inbox rows and SDK contacts. */
export type SourceScopedIdentity = {
  sourceId: string
  sourceUserId?: string | null
  sourceParentUserId?: string | null
}

export type SourceScopedIdentityMatchedBy =
  | "sourceId"
  | "sourceUserId"
  | "sourceParentUserId"

export type SourceScopedIdentityMatch<T> = {
  row: T
  matchedBy: SourceScopedIdentityMatchedBy
}

export type SourceScopedIdentityLookup<T> = (
  where:
    | { sourceId: string }
    | { sourceUserId: string }
    | { sourceParentUserId: string },
) => Promise<T | undefined>

/**
 * An identity is "scoped-user-id keyed" when its primary `sourceId` IS its
 * channel-scoped user id (e.g. a WhatsApp BSUID). Such identities must be
 * addressed by the scoped id on outbound sends; an identity rotation may
 * atomically advance both fields while preserving this invariant.
 */
export const isSourceUserIdKeyedIdentity = (
  identity: SourceScopedIdentity,
): boolean =>
  Boolean(identity.sourceUserId) && identity.sourceId === identity.sourceUserId

/** Whether a non-empty primary identity differs from every scoped identity. */
export const isDistinctPrimaryIdentity = (
  value: string | null | undefined,
  ...scopedIds: Array<string | null | undefined>
): boolean => {
  const primaryIdentity = value?.trim()
  return (
    Boolean(primaryIdentity) &&
    scopedIds.every((scopedId) => scopedId?.trim() !== primaryIdentity)
  )
}

/**
 * Whether an outbound send must address this identity by its scoped user id
 * instead of `sourceId`: either the row is scoped-user-id keyed, or its
 * `sourceId` is empty (no primary address at all — e.g. a WhatsApp contact
 * whose phone was never known) while a scoped id exists. Addressing an empty
 * `sourceId` would silently fail, so the scoped id is the only valid route.
 */
export const shouldAddressBySourceUserId = (
  identity: SourceScopedIdentity,
): boolean =>
  isSourceUserIdKeyedIdentity(identity) ||
  (Boolean(identity.sourceUserId) && identity.sourceId === "")

/**
 * The ordered contact-inbox identity lookup every consumer shares: probe the
 * primary `sourceId` first, then the scoped user id, then its parent scoped id.
 * Callers supply the actual query, so each site keeps its own relations and
 * extra filters — only the ordering contract lives here and cannot drift.
 */
export const resolveSourceScopedIdentityMatch = async <T>(
  identity: SourceScopedIdentity,
  lookup: SourceScopedIdentityLookup<T>,
): Promise<SourceScopedIdentityMatch<T> | undefined> => {
  const bySourceId = await lookup({ sourceId: identity.sourceId })
  if (bySourceId) {
    return { row: bySourceId, matchedBy: "sourceId" }
  }
  if (identity.sourceUserId) {
    const bySourceUserId = await lookup({
      sourceUserId: identity.sourceUserId,
    })
    if (bySourceUserId) {
      return { row: bySourceUserId, matchedBy: "sourceUserId" }
    }
  }
  if (identity.sourceParentUserId) {
    const bySourceParentUserId = await lookup({
      sourceParentUserId: identity.sourceParentUserId,
    })
    if (bySourceParentUserId) {
      return { row: bySourceParentUserId, matchedBy: "sourceParentUserId" }
    }
  }
  return
}

export type OutgoingContact = {
  sourceId: string
  id: string
  sourceConversationId?: string | null
  lastIncomingMessageAt?: Date | string | null
  /**
   * Channel persona selected for this contact connection (e.g. Messenger
   * persona). Carries the platform's local persona id; the channel resolves it
   * to the provider-specific persona id at send time. Sourced from
   * `ContactInbox.personaId`.
   */
  personaId?: string | null
  /**
   * Alternate stable channel-scoped user id, independent of `sourceId`
   * (e.g. WhatsApp Business-Scoped User ID). Sourced from
   * `ContactInbox.sourceUserId`.
   */
  sourceUserId?: string | null
}

export type OutgoingMessage = {
  id: string
  workspaceId: string
  additionalAttributes?: { [x: string]: unknown }
  contentAttributes?: { [x: string]: unknown } | null
  conversationId: string
  contentType: ContentType
  text: string | null
  attachments?: OutgoingAttachment[]
  clientId?: string | null
  messageType: MessageType
}

export const messageTypes = z.enum(["outgoing", "incoming", "activity"])

/**
 * Who sent the message a channel is echoing back to us. A channel parser
 * classifies its own echoes; the shared worker only acts on the enum.
 * - `firstParty`: the channel's own inbox (e.g. Facebook Page Inbox).
 * - `thirdParty`: another app connected to the same channel account.
 */
export const echoOrigins = z.enum(["firstParty", "thirdParty"])
export type EchoOrigin = z.infer<typeof echoOrigins>

/**
 * Channel-agnostic conversation-routing (thread control) vocabulary shared by
 * channel integrations. The persisted state model lives in
 * `@chatbotx.io/database/partials` (`thread-control.ts`); the SDK cannot depend
 * on the database layer, so the role/action values are mirrored here and
 * pinned to the database copy by `packages/database/__tests__/thread-control-sdk-parity.test.ts`.
 */
export const threadControlRoles = z.enum([
  "ai_agent",
  "ctwa",
  "customer_service",
  "escalation",
  "marketing",
  "utility",
])
export type ThreadControlRole = z.infer<typeof threadControlRoles>

export const threadControlActions = z.enum(["take", "release", "pass"])
export type ThreadControlAction = z.infer<typeof threadControlActions>

/**
 * Which responder role a delivery reached us in: `owner` = the channel's normal
 * inbound feed, `standby` = the listen-only standby feed.
 */
export const threadControlDeliveries = z.enum(["owner", "standby"])
export type ThreadControlDelivery = z.infer<typeof threadControlDeliveries>

/** One line of a history-shaped conversation context. */
export const threadControlHistoryItemSchema = z.object({
  sender: z.enum(["user", "business"]),
  text: z.string(),
  /** Unix epoch seconds as sent by the channel; display only. */
  timestamp: z.string().optional(),
})
export type ThreadControlHistoryItem = z.infer<
  typeof threadControlHistoryItemSchema
>

/** Display-only context a previous owner hands over (summary text is opaque). */
export const threadControlContextSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("summary"), text: z.string() }),
  z.object({
    type: z.literal("history"),
    items: z.array(threadControlHistoryItemSchema),
  }),
])
export type ThreadControlContext = z.infer<typeof threadControlContextSchema>

export type ThreadControlReceiveInfo = {
  delivery: ThreadControlDelivery
  context?: ThreadControlContext
  /**
   * The channel's own timestamp of the delivered item. Routing transitions are
   * ordered by it, so a delayed job cannot overwrite a later handover.
   */
  occurredAt?: Date
  /**
   * Owner app id observed on a `standby` delivery, for channels that name
   * owners by app id. Absent/null when the channel did not say (roles and the
   * owner delivery never set it: owning needs no app id).
   */
  ownerAppId?: string | null
  /**
   * Owner role observed on a `standby` delivery (e.g. `ai_agent` when the
   * channel flags an AI owner). Absent/null = unstated; ignored for an owner
   * delivery.
   */
  ownerRole?: ThreadControlRole | null
}

export type ThreadControlWebhookEvent = {
  contact: IncomingContact
  event: "controlPassed" | "controlTaken"
  previousOwnerRole: ThreadControlRole | null
  newOwnerRole: ThreadControlRole | null
  handoverNote?: string
  context?: ThreadControlContext
  /**
   * Owner identity for channels that name owners by app id instead of a role
   * (the role fields above stay `null` for those). Absent when the channel
   * payload does not carry it (e.g. a take names only the previous owner).
   */
  previousOwnerAppId?: string
  newOwnerAppId?: string
  /**
   * The channel's AI-agent app id (e.g. Messenger's Business AI), so shared
   * code can tell a hand-back FROM the AI agent from any other hand-back
   * without reading channel config. Absent when the channel has no AI-agent app.
   */
  aiAgentAppId?: string
  /**
   * A handover the channel inferred from a notice rather than a structured
   * pass/take (so it may be stale): applied only while the stored thread is
   * held by this app. On a thread another owner (e.g. us) already holds it is
   * dropped, so a notice never re-fires the hand-back response.
   */
  onlyIfOwnedByAppId?: string
  /**
   * Whether this handover starts the resume flow. The CHANNEL decides (it
   * alone knows which passes mean "handed back to us"); absent = never.
   */
  resumeEligible?: boolean
  occurredAt: Date
}

/**
 * A partner asking for the thread (`request_thread_control`). Parsed so the
 * channel can acknowledge it, but no ownership change follows from it.
 */
export type ThreadControlRequestEvent = {
  contact: IncomingContact
  requestedOwnerAppId?: string
  handoverNote?: string
  occurredAt: Date
}

/**
 * Receiver configuration of the account (which app is the primary receiver).
 * Account-level: carries no contact, so it never touches a thread.
 */
export type ThreadControlAppRolesEvent = {
  /** The account id the roles belong to. */
  accountId: string
  /** app id -> roles that app holds. */
  roles: Record<string, string[]>
  occurredAt: Date
}

/**
 * What a channel's `updateThreadControl` reports back after Meta accepted the
 * action: the owner of the thread AFTER it (`null` = no owner, e.g. released,
 * or an owner the channel cannot express as a role). The channel decides —
 * whether a take makes us the escalation partner or an app id owner is a
 * channel rule, not a shared one.
 */
export type ThreadControlUpdateResult = {
  ownerRole: ThreadControlRole | null
  /** Owner app id after the action, for channels that name owners by app id. */
  ownerAppId?: string | null
}

/**
 * Bulk "hand every thread to the AI agent / take the AI-held ones back".
 * `takeFromAi` is the channel's way of taking a thread over with a human
 * message (Messenger: a HUMAN_AGENT-tagged send), so it carries `text`.
 */
export type BulkThreadControlAction = "handToAi" | "takeFromAi"

/**
 * The transport facts of a channel's bulk thread-control call, advertised by
 * its adapter so shared code never assumes one channel's numbers.
 */
export type BulkThreadControlLimits = {
  /** Most threads one bulk call can carry (Messenger: a Graph batch of 50). */
  maxBatchSize: number
  /** Pause between two calls, to spread the channel's quota over time. */
  batchGapMs: number
  /**
   * How long to wait when the channel refuses a whole call for its rate limit
   * without saying when to retry (the caller must stop calling meanwhile).
   */
  rateLimitPauseMs: number
}

/** The thread-control event a succeeded bulk item records on the thread. */
export type BulkThreadControlRecordedEvent = "passed" | "serviceSent"

/**
 * Outcome of one thread in a bulk call. `failed` means the channel definitely
 * did not apply it (safe to retry when the error is retryable); `unknown`
 * means it may have been applied (a timed-out or 5xx sub-request) and must not
 * be retried for a send, since a retry could deliver the message twice.
 */
export type BulkThreadControlItemResult =
  | {
      contactInboxId: string
      status: "succeeded"
      /** What happened to the thread: a hand-over is a pass, a tagged send a takeover. */
      event: BulkThreadControlRecordedEvent
      ownerRole: ThreadControlRole | null
      ownerAppId: string | null
      /** Channel id of the message a `takeFromAi` sent, when there is one. */
      messageSourceId: string | null
    }
  | { contactInboxId: string; status: "failed"; error: ChannelError }
  | { contactInboxId: string; status: "unknown"; error: ChannelError }
  /**
   * Not applied because the channel asked to slow down (a rate limit, or the
   * quota is nearly used up): nothing happened, so it is safe to retry after
   * `retryAfterMs`.
   */
  | { contactInboxId: string; status: "deferred"; error: ChannelError }

/** What one bulk call reports back. */
export type BulkThreadControlResult = {
  /** One entry per input contact, in input order. */
  results: BulkThreadControlItemResult[]
  /**
   * The channel asks the caller to wait this long before its next call (its
   * quota is exhausted or close to it). `null` = carry on.
   */
  retryAfterMs: number | null
}

/**
 * What a channel's `getThreadOwner` reports: who holds the thread according to
 * the channel itself. `ownerAppId: null` = the channel says nobody holds it.
 * A channel that cannot answer does not implement the handler at all, so a
 * missing handler means "cannot sync", never "no owner".
 */
export type ThreadOwnerResult = {
  ownerAppId: string | null
  /** When the channel says the ownership lapses; `null` when it does not. */
  expiresAt: Date | null
  /**
   * The channel's own identities, resolved on the channel side so shared code
   * can classify `ownerAppId` without reading channel config: OUR app id, and
   * the automated-assistant app id. Absent/null = the channel does not know.
   */
  ownAppId?: string | null
  aiAgentAppId?: string | null
}

export type ThreadControlWebhookResult =
  | { kind: "handover"; event: ThreadControlWebhookEvent }
  /** A thread request: parsed and ignored (no ownership change). */
  | { kind: "handoverRequest"; event: ThreadControlRequestEvent }
  /** Receiver configuration: parsed and logged only. */
  | { kind: "appRoles"; event: ThreadControlAppRolesEvent }
  /** Handed unchanged to `receiveMessage`. */
  | {
      kind: "standbyMessage"
      receivePayload: unknown
      /**
       * The same message as a regular (owner) delivery, for a channel whose
       * standby copy can be re-processed once this app holds the thread again
       * (the channel does not resend it). Absent when it cannot be replayed.
       */
      ownerReplayPayload?: unknown
      /** The channel's AI-agent app id, to recognise a thread this app took from it. */
      aiAgentAppId?: string
    }
export type MessageType = z.infer<typeof messageTypes>

export type IncomingMessage = {
  sourceId: string
  messageType: MessageType
  contentType: ContentType
  text?: string
  type?: "message" | "comment"
  parentId?: string | null
  contentAttributes?:
    | MessageLocationEntity
    | MessageTemplateEntity
    | MessageWhatsappFlowResponseEntity
    | MessageStoryReplyEntity
    | MessageSharedPostEntity
    | MessageWhatsappCallEntity
    | MessageWhatsappCallPermissionReplyEntity
    | { [x: string]: unknown }
  attachments?: IncomingAttachment[]
  clientId?: string | null
}

export type MessageWhatsappFlowResponseEntity = {
  type: "whatsapp_flow_response"
  name?: string
  flowResponse: Record<string, unknown>
  flowToken: string | null
  decoded: ButtonPayload | null
}

/**
 * Carried on a message that is the contact's reply to one of the workspace's
 * Instagram/Messenger stories (Meta's `reply_to.story` webhook field), so the
 * inbox can render "Replied to your story" context instead of showing it as
 * a plain text message. `story.url` is Meta's CDN link and is short-lived.
 */
export type MessageStoryReplyEntity = {
  type: "story_reply"
  story: {
    id: string
    url?: string
  }
}

/**
 * Carried on a message whose payload is a shared post rather than text or an
 * attachment (TikTok's `type: "share_post"` DM). The message's `text` holds the
 * link so it is readable and clickable in the inbox today; this keeps the ids
 * intact so a richer preview can be rendered later without re-parsing the text.
 *
 * `url` is the channel's own link for the share, verbatim — TikTok sends a
 * player URL with its own tracking params, and rewriting it into a
 * `tiktok.com/@user/video/<id>` guess would mean inventing an author handle the
 * webhook never carries.
 */
export type MessageSharedPostEntity = {
  type: "shared_post"
  sharedPost: {
    postId: string
    url?: string
  }
}

/**
 * Written when a WhatsApp call terminates. The single progressive activity message for a
 * call — recording/transcript/summary handlers enrich it in place via messageContentUpdated
 * rather than creating a second message. callId is the DB WhatsappCall.id.
 */
export type MessageWhatsappCallEntity = {
  type: "whatsapp_call"
  direction: "userInitiated" | "businessInitiated"
  /**
   * canceled is a display-only refinement of a not-answered outbound call
   * (agent hung up before pickup, vs failed meaning the customer never
   * answered). Not a DB WhatsappCall.status value; derived from the business-
   * cancel marker on the row.
   */
  status: "completed" | "failed" | "rejected" | "canceled"
  /** Billed talk time (Meta duration): answer to hangup. */
  durationSeconds?: number
  /**
   * Time-to-answer (ring wait) from placement to answer. Absent when the answer
   * timestamp is unknown.
   */
  answerSeconds?: number
  /** DB WhatsappCall.id. */
  callId?: string
  /**
   * ISO time this call opened or refreshed the 24-hour customer service window;
   * absent when it did not. A user's call always opens it; a business call only
   * once accepted.
   */
  customerServiceWindowOpenedAt?: string
  hasRecording?: boolean
  /**
   * Whether a recording was requested (the number's Record calls setting at
   * hangup time). Gates the processing placeholder so a call that never
   * requested recording shows no player row.
   */
  recordingRequested?: boolean
  /** Requested at hangup time, per workspace/integration setting. */
  transcriptionRequested?: boolean
  hasTranscript?: boolean
  hasSummary?: boolean
  recordingExpired?: boolean
  /**
   * True when this call will never have a recording even though the number
   * records calls (Meta refused the announcement, or capture never started).
   * Distinct from recordingExpired (existed, then aged out).
   */
  recordingUnavailable?: boolean
  /**
   * Snapshotted at finalize time, never re-resolved, so a later rename or
   * deletion can't rewrite history. Also populated for outbound VoIP calls with
   * the INITIATING agent, not necessarily who answered - the card derives its
   * label from direction instead.
   */
  agentUserId?: string
  /**
   * Display-name snapshot paired with agentUserId, resolved once at finalize.
   * Absent if the id couldn't be resolved - card renders no agent line rather
   * than an empty label.
   */
  agentName?: string
  /**
   * Meta's raw diagnosis for why the call ended badly, carried verbatim from
   * the terminate webhook (e.g. a media-drop code when answered but no audio
   * was received). May be just an error code with no explanation. Absent when
   * there was no terminate-reported error.
   */
  failureReason?: string
}

/**
 * Carried on the message written when a contact answers a business-calling
 * permission request. Worker persists the grant state; inbox renders a
 * localized label.
 */
export type MessageWhatsappCallPermissionReplyEntity = {
  type: "whatsapp_call_permission_reply"
  response: "accept" | "reject"
  isPermanent?: boolean
  /** Unix seconds; absent for permanent grants. */
  expirationTimestamp?: number
  responseSource?: string
}

/**
 * Marks an outgoing message as a business-calling permission request; the
 * WhatsApp send handler renders it as the call_permission_request interactive
 * instead of plain text.
 */
export type MessageWhatsappCallPermissionRequestEntity = {
  type: "whatsapp_call_permission_request"
}

export const getWhatsappCallPermissionRequest = (
  contentAttributes: unknown,
): MessageWhatsappCallPermissionRequestEntity | undefined => {
  if (!contentAttributes || typeof contentAttributes !== "object") {
    return
  }
  const attrs = contentAttributes as { type?: string }
  return attrs.type === "whatsapp_call_permission_request"
    ? (contentAttributes as MessageWhatsappCallPermissionRequestEntity)
    : undefined
}

/**
 * Extracts the story-reply payload from a message's contentAttributes,
 * accepting both the current `{ type: "story_reply", story }` shape and the
 * legacy `{ storyReply }` shape some already-persisted rows still carry.
 * Centralized so callers (worker routing, direction correction, inbox
 * rendering) can't drift from each other on the shape check.
 */
export const getStoryReply = (
  contentAttributes: unknown,
): MessageStoryReplyEntity["story"] | undefined => {
  if (!contentAttributes || typeof contentAttributes !== "object") {
    return
  }
  const attrs = contentAttributes as {
    type?: string
    story?: MessageStoryReplyEntity["story"]
    storyReply?: MessageStoryReplyEntity["story"]
  }
  return attrs.type === "story_reply" ? attrs.story : attrs.storyReply
}

/**
 * Centralized so the worker (writer) and inbox renderer (reader) cannot drift
 * on the shape check.
 */
export const getWhatsappCallEntity = (
  contentAttributes: unknown,
): MessageWhatsappCallEntity | undefined => {
  if (!contentAttributes || typeof contentAttributes !== "object") {
    return
  }
  const attrs = contentAttributes as { type?: string }
  return attrs.type === "whatsapp_call"
    ? (contentAttributes as MessageWhatsappCallEntity)
    : undefined
}

/**
 * A contact's message always opens the window; an activity card only when it
 * explicitly carries the moment - the server decides so callers never re-derive
 * channel window policy.
 */
export const resolveMessagingWindowOpenedAt = (message: {
  messageType: string
  createdAt: Date | string
  contentAttributes?: unknown
}): Date | null => {
  const openedAt =
    message.messageType === "incoming"
      ? message.createdAt
      : getWhatsappCallEntity(message.contentAttributes)
          ?.customerServiceWindowOpenedAt
  return openedAt ? new Date(openedAt) : null
}

/**
 * Sentinel written to WhatsappCall.lastError by the agent-hangup path for an
 * outbound call that was never answered - distinguishes business-cancelled from
 * customer-never-picked-up (both otherwise land on status failed). Exact-match
 * discriminator only, never shown to users.
 */
export const CALL_CANCELED_BY_BUSINESS_LAST_ERROR = "canceled_by_business"

export type WhatsappCallActivityLabelKey =
  | "declinedVoiceCall"
  | "missedVoiceCall"
  | "unansweredVoiceCall"
  | "canceledVoiceCall"

/**
 * Single source of truth for a non-completed call outcome's label (completed is excluded —
 * it renders the full player card, not a flat label). Wording is direction-aware: labeling a
 * not-answered outbound call "missed" would wrongly blame the business.
 */
export const resolveWhatsappCallActivityLabelKey = (
  status: Exclude<MessageWhatsappCallEntity["status"], "completed">,
  direction: MessageWhatsappCallEntity["direction"],
): WhatsappCallActivityLabelKey => {
  if (status === "canceled") {
    // The agent hung up before the call connected - never "no answer" or
    // "missed".
    return "canceledVoiceCall"
  }
  if (status === "rejected") {
    return "declinedVoiceCall"
  }
  return direction === "userInitiated"
    ? "missedVoiceCall"
    : "unansweredVoiceCall"
}

export const getWhatsappCallPermissionReply = (
  contentAttributes: unknown,
): MessageWhatsappCallPermissionReplyEntity | undefined => {
  if (!contentAttributes || typeof contentAttributes !== "object") {
    return
  }
  const attrs = contentAttributes as { type?: string; response?: unknown }
  return attrs.type === "whatsapp_call_permission_reply" &&
    (attrs.response === "accept" || attrs.response === "reject")
    ? (contentAttributes as MessageWhatsappCallPermissionReplyEntity)
    : undefined
}

export const MessageEntitySchema = z.custom<IncomingMessage>(
  (data) => typeof data === "object",
)

export type IncomingAttachment = {
  sourceId: string
  fileType: IncomingFileType
  mimeType: string
  originPath: string
  size: number
  url?: string
  width?: number | null
  height?: number | null
  name?: string
}

export type OutgoingAttachment = {
  fileType: FileType
  mimeType: string
  originPath: string
  size: number
  url: string
  width?: number | null
  height?: number | null
  name?: string | null
}

export type ExternalMediaResult = {
  originPath: string
  size: number
  width?: number
  height?: number
  name?: string
}

export type MessageLocationEntity = {
  latitude: string
  longitude: string
}

export type MessageButtonTemplate = {
  id: string
  label: string
} & (
  | {
      buttonType: "url"
      url: string
      /** Enables Messenger Extensions in Facebook/Messenger webviews. */
      messengerExtensions?: boolean
      /** Encoded flow payload for channels that cannot render URL quick replies. */
      postback?: string
    }
  | {
      buttonType: "postback"
      postback: string
    }
)

/**
 * Reserved MessageButtonTemplate postback payloads that ask the Messenger
 * channel to render Facebook's native "share your email / phone" quick
 * reply (Send API content_type "user_email" / "user_phone_number") instead
 * of a literal text button. Facebook fills the value from the contact's own
 * Messenger account at tap time, so the sender never needs to know it in
 * advance. Only integrations/messenger's quick reply converter interprets
 * these; every other channel just renders them as an inert text button, so
 * callers must gate emitting them to the messenger channel.
 */
export const MESSENGER_NATIVE_QUICK_REPLY = {
  USER_EMAIL: "messenger:native-quick-reply:user_email",
  USER_PHONE_NUMBER: "messenger:native-quick-reply:user_phone_number",
} as const

/**
 * Reserved MessageButtonTemplate postback that asks the WhatsApp channel to
 * send Cloud API `interactive.location_request_message` (Meta's native
 * "Send location" button) instead of a text prompt. Only
 * integrations/whatsapp's outgoing converter interprets this; every other
 * channel would render it as an inert text button, so callers must gate
 * emitting it to the WhatsApp channel.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-location-request-messages
 */
export const WHATSAPP_NATIVE_LOCATION_REQUEST =
  "whatsapp:native:location_request" as const

/**
 * Channels that can render a native "share your location" control for
 * getUserData's location reply format (RF08). Callers must gate on this set
 * and fall back to a plain-text prompt elsewhere — same contract as
 * {@link URL_QUICK_REPLY_CAPABLE_CHANNELS}.
 */
export const NATIVE_LOCATION_REQUEST_CHANNELS: ReadonlySet<string> = new Set([
  "whatsapp",
])

/**
 * Channels whose outgoing message converter renders a `MessageButtonTemplate`
 * with `buttonType: "url"` as an actual link-opening button (a real
 * clickable/tappable control the platform navigates from), verified by
 * reading each channel's outgoing quick-reply/button converter:
 *
 * - `messenger`: `contentAttributes`-driven button template converts to a
 *   Facebook `web_url` button (`integrations/messenger/.../outgoing-message/index.ts`
 *   `toFacebookButton`).
 * - `telegram`: `buildCanonicalInlineButton` maps `buttonType: "url"` to an
 *   inline keyboard button with a real `url` field
 *   (`integrations/telegram/.../outgoing-message/send-button.ts`).
 *
 * Every other channel silently degrades a `buttonType: "url"` quick reply:
 * WhatsApp turns it into an interactive reply id (the URL string becomes the
 * tapped reply's id, not a link), Instagram (both the direct and
 * Facebook-mediated integrations) turns it into a plain text quick reply
 * whose payload is the URL string, and Zalo/TikTok's outgoing `sendMessage`
 * handler does not read `quickReplies` at all, so the button is dropped
 * entirely. Callers that need a URL to be genuinely openable by the contact
 * (e.g. a webview picker) must gate on this set and fall back to a
 * non-button prompt for every other channel — this file already documents
 * that callers must gate channel-specific button behavior; this constant is
 * declarative capability data, not channel-branching logic, so it is safe to
 * keep here.
 */
export const URL_QUICK_REPLY_CAPABLE_CHANNELS: ReadonlySet<string> = new Set([
  "messenger",
  "telegram",
])

export function getCanonicalReplyPayload(
  button: MessageButtonTemplate,
): string {
  if (button.buttonType === "postback") {
    return button.postback
  }

  return button.postback ?? button.url
}

export const isWhatsappNativeLocationRequest = (
  buttons: readonly MessageButtonTemplate[] | undefined,
): boolean =>
  Boolean(
    buttons?.some(
      (button) =>
        getCanonicalReplyPayload(button) === WHATSAPP_NATIVE_LOCATION_REQUEST,
    ),
  )

export type MessageCardTemplate = {
  id: string
  title: string
  subtitle?: string
  imageUrl?: string
  buttons?: MessageButtonTemplate[]
}

export type MessageTemplateEntity = {
  type: "template" | "whatsapp_template" | "messenger_template"
  payload:
    | {
        templateType: "button"
        buttons: MessageButtonTemplate[]
      }
    | {
        templateType: "carousel"
        cards: MessageCardTemplate[]
      }
}

export const contentTypes = z.enum(["text", "location", "refLink"])
export type ContentType = z.infer<typeof contentTypes>

export const fileTypes = z.enum(["image", "audio", "video", "file"])
export type FileType = z.infer<typeof fileTypes>

// Inbound only. `gif` marks an animated clip the inbox autoplays on loop — an
// image/gif file or a video rendition of one (Telegram animations, video
// stickers). Outbound stays on `fileTypes`: channel send APIs take no "gif".
export const incomingFileTypes = z.enum([...fileTypes.options, "gif"])
export type IncomingFileType = z.infer<typeof incomingFileTypes>
