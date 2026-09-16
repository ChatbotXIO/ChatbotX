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
 * Carried on the call-activity message written into a conversation when a
 * WhatsApp Business call terminates, so the inbox can render a localized
 * "Voice call" / "Missed voice call" row instead of raw text. `status` is the
 * terminal call status; a `failed` user-initiated call renders as missed.
 *
 * This is the SINGLE progressive activity message for a call: it never
 * carries the recording/transcript bytes or the diarized segments — only
 * flags. The recording/transcript/summary handlers enrich
 * this exact message in place (via `messageContentUpdated`) as each becomes
 * available instead of creating a second `whatsapp_call_recording` message.
 * `callId` is the DB `WhatsappCall.id`, always present from finalize onward —
 * the card uses it to request a lazily-signed playback URL
 * (`getCallRecordingUrlAction`) and to open the Call Information sheet.
 */
export type MessageWhatsappCallEntity = {
  type: "whatsapp_call"
  direction: "userInitiated" | "businessInitiated"
  /**
   * `canceled` is a DISPLAY-only refinement of a not-answered outbound call:
   * the agent hung up before the customer picked up (vs `failed`, which means
   * the customer never answered / a genuine failure). It is not a DB
   * `WhatsappCall.status` value — the finalize derives it from the
   * business-cancel marker on the row (see
   * {@link CALL_CANCELED_BY_BUSINESS_LAST_ERROR}).
   */
  status: "completed" | "failed" | "rejected" | "canceled"
  /** Billed talk time (Meta `duration`): answer → hangup. Shown in the player. */
  durationSeconds?: number
  /**
   * Time-to-answer (ring wait): from when the call was placed/started ringing
   * (`WhatsappCall.createdAt`, stamped on the `connect`/dial) to when it was
   * answered (`start_time`). Shown under the "Audio call" header — distinct
   * from {@link durationSeconds}, which is the talk time. Absent when the
   * answer timestamp is unknown (e.g. a never-answered or legacy call).
   */
  answerSeconds?: number
  /** The DB `WhatsappCall.id` — absent only on legacy rows. */
  callId?: string
  /** `true` once a recording has been uploaded and attached to this message. */
  hasRecording?: boolean
  /**
   * Whether a recording was requested for this call (the number's "Record
   * calls" setting at hangup time). Gates the "processing…" placeholder: a
   * call that never requested a recording shows no player row at all, rather
   * than a placeholder that can never resolve.
   */
  recordingRequested?: boolean
  /** Whether transcription was requested for this call (workspace/integration setting at hangup time). */
  transcriptionRequested?: boolean
  /** `true` once a transcript (flat or diarized) has been stamped. */
  hasTranscript?: boolean
  /** `true` once an on-demand AI summary has been generated. */
  hasSummary?: boolean
  /** `true` once the recording has been purged past its retention window. */
  recordingExpired?: boolean
  /**
   * `true` when this call will never have a recording even though the number
   * records calls — Meta refused the recording announcement, or the capture
   * never started. Distinct from `recordingExpired` (a recording existed and
   * aged out) and from the still-processing state.
   */
  recordingUnavailable?: boolean
}

/**
 * Carried on the message written when a contact answers a business-calling
 * permission request (`interactive.type: "call_permission_reply"`). The
 * worker persists the grant state from it and the inbox renders a localized
 * label.
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
 * Marks an outgoing message as a business-calling permission request. The
 * WhatsApp send handler renders it as the `call_permission_request`
 * interactive (with the message text as body) instead of a plain text.
 */
export type MessageWhatsappCallPermissionRequestEntity = {
  type: "whatsapp_call_permission_request"
}

/** Shape-checked accessor for {@link MessageWhatsappCallPermissionRequestEntity}. */
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
 * Extracts the WhatsApp call payload from a message's contentAttributes.
 * Centralized so the worker (which writes it) and the inbox renderer (which
 * localizes it) cannot drift on the shape check.
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
 * Sentinel written to `WhatsappCall.lastError` by the agent-hangup path when
 * it ends an OUTBOUND call that was never answered — the one signal that tells
 * the terminate-webhook finalize "the business cancelled this" apart from "the
 * customer never picked up" (both otherwise land on DB status `failed`). Read
 * ONLY as an exact-match discriminator, never surfaced to users.
 */
export const CALL_CANCELED_BY_BUSINESS_LAST_ERROR = "canceled_by_business"

/** The `messages.*` i18n key for a non-`completed` call outcome's label. */
export type WhatsappCallActivityLabelKey =
  | "declinedVoiceCall"
  | "missedVoiceCall"
  | "unansweredVoiceCall"
  | "canceledVoiceCall"

/**
 * SINGLE SOURCE OF TRUTH for a non-`completed` call outcome's label — shared
 * by the inbox card (localized via `t(messages.<key>)`) and the stored
 * activity text / conversation snippet (English fallback) so the two can
 * never disagree (the "Failed voice call" card vs "Missed voice call" snippet
 * bug). `completed` is intentionally excluded: it renders the full player
 * card and a duration-bearing preview, not a flat label.
 *
 * Wording is direction-aware because "missed" and "unanswered" are NOT
 * interchangeable: a not-answered INBOUND call is one the business *missed*;
 * a not-answered OUTBOUND call is one the customer did not pick up ("no
 * answer") — labeling the latter "missed" wrongly blames the business.
 */
export const resolveWhatsappCallActivityLabelKey = (
  status: Exclude<MessageWhatsappCallEntity["status"], "completed">,
  direction: MessageWhatsappCallEntity["direction"],
): WhatsappCallActivityLabelKey => {
  if (status === "canceled") {
    // The agent hung up before the call connected — never "no answer" (the
    // customer was never given the chance) nor "missed".
    return "canceledVoiceCall"
  }
  if (status === "rejected") {
    return "declinedVoiceCall"
  }
  return direction === "userInitiated"
    ? "missedVoiceCall"
    : "unansweredVoiceCall"
}

/**
 * @deprecated Superseded by the single progressive `whatsapp_call` activity
 * message — the recording/transcript handlers now
 * enrich the finalize `MessageWhatsappCallEntity` in place instead of
 * creating this second message. Kept ONLY so already-persisted rows from
 * before this change keep rendering (`getWhatsappCallRecordingEntity`,
 * `CallRecordingActivity`) — never written by new code.
 *
 * Was carried on the activity message created when a call recording finished
 * uploading. The audio itself lived on the message's `audio` attachment —
 * this entity only carried the DB `WhatsappCall.id` (never a wacid/attemptId,
 * matching every other call entity's convention) so the inbox could request
 * a fresh signed playback URL, plus the transcript once
 * `handleWhatsappCallTranscribe` enriched it via `updateContentBySourceId`.
 */
export type MessageWhatsappCallRecordingEntity = {
  type: "whatsapp_call_recording"
  callId: string
  transcript?: string | null
}

/**
 * Extracts the call-recording payload from a message's contentAttributes.
 * Centralized so the worker (which writes/enriches it) and the inbox
 * renderer (which shows the audio + transcript) cannot drift on the shape
 * check.
 */
export const getWhatsappCallRecordingEntity = (
  contentAttributes: unknown,
): MessageWhatsappCallRecordingEntity | undefined => {
  if (!contentAttributes || typeof contentAttributes !== "object") {
    return
  }
  const attrs = contentAttributes as { type?: string }
  return attrs.type === "whatsapp_call_recording"
    ? (contentAttributes as MessageWhatsappCallRecordingEntity)
    : undefined
}

/** Shape-checked accessor for {@link MessageWhatsappCallPermissionReplyEntity}. */
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
