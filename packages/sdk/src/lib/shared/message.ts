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

export function getCanonicalReplyPayload(
  button: MessageButtonTemplate,
): string {
  if (button.buttonType === "postback") {
    return button.postback
  }

  return button.postback ?? button.url
}

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
