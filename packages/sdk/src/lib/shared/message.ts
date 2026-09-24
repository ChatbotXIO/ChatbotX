import type { ButtonPayload } from "@chatbotx.io/flow-config"
import { z } from "zod"

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

/** The `{ sourceId, sourceUserId }` slice shared by contact-inbox rows and SDK contacts. */
export type SourceScopedIdentity = {
  sourceId: string
  sourceUserId?: string | null
}

/**
 * An identity is "scoped-user-id keyed" when its primary `sourceId` IS its
 * channel-scoped user id (e.g. a WhatsApp BSUID) — set once at contact
 * creation for users whose phone number is hidden, and never rewritten.
 * Such identities must be addressed by the scoped id on outbound sends.
 */
export const isSourceUserIdKeyedIdentity = (
  identity: SourceScopedIdentity,
): boolean =>
  Boolean(identity.sourceUserId) && identity.sourceId === identity.sourceUserId

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
 * primary `sourceId` first, then the scoped user id (e.g. a WhatsApp BSUID)
 * only when the first probe missed and a scoped id exists. Callers supply the
 * actual query, so each site keeps its own relations and extra filters —
 * only the ordering contract lives here and cannot drift between them.
 */
export const resolveWithSourceUserIdFallback = async <T>(
  identity: SourceScopedIdentity,
  lookup: (
    where: { sourceId: string } | { sourceUserId: string },
  ) => Promise<T | undefined>,
): Promise<T | undefined> => {
  const bySourceId = await lookup({ sourceId: identity.sourceId })
  if (bySourceId || !identity.sourceUserId) {
    return bySourceId
  }
  return await lookup({ sourceUserId: identity.sourceUserId })
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
export type MessageType = z.infer<typeof messageTypes>

export type IncomingMessage = {
  sourceId: string
  /** The channel's authoritative message time, when the channel provides one. */
  createdAt?: Date
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
  fileType: FileType
  mimeType: string
  originPath: string
  size: number
  url?: string
  width?: number | null
  height?: number | null
  name?: string
}

export type EchoAttachmentDescriptor = {
  sourceId: string
  type: string
  url: string
  [key: string]: unknown
}

export type EchoParseResult = {
  sourceId: string
  contactSourceId: string
  createdAt: Date
  text?: string | null
  contentType: ContentType
  contentAttributes?: Record<string, unknown> | null
  attachments: EchoAttachmentDescriptor[]
}

const CHANNEL_MESSAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const CHANNEL_MESSAGE_MAX_FUTURE_MS = 5 * 60 * 1000

export const resolveChannelMessageCreatedAt = (
  timestampMs: number,
  now: Date = new Date(),
): Date | null => {
  const earliest = now.getTime() - CHANNEL_MESSAGE_MAX_AGE_MS
  const latest = now.getTime() + CHANNEL_MESSAGE_MAX_FUTURE_MS
  return Number.isFinite(timestampMs) &&
    timestampMs >= earliest &&
    timestampMs <= latest
    ? new Date(timestampMs)
    : null
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
