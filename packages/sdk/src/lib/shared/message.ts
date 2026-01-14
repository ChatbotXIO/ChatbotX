import { z } from "zod"

export type ContactEntity = {
  sourceId: string
  phoneNumber?: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
  gender?: string
}

export type ConversationEntity = {
  sourceId: string
  inboxId?: string
  conversationAttributes: Record<string, unknown>
  contact: ContactEntity
}

export const conversationEntitySchema = z.custom<ConversationEntity>(
  (data) => typeof data === "object",
)

export type OutgoingMessageEntity = {
  chatbotId: string
  conversationId: string
  contentType: ContentType
  content?: string
  attachments?: AttachmentEntity[]
}

export const MessageType = {
  incoming: "incoming",
  outgoing: "outgoing",
} as const
export type MessageType = (typeof MessageType)[keyof typeof MessageType]

export type MessageEntity = {
  sourceId: string
  messageType: MessageType
  contentType: ContentType
  content?: string
  contentAttributes?: MessageLocationEntity | MessageTemplateEntity | unknown
  attachments?: AttachmentEntity[]
  clientId?: string | null
}

export const MessageEntitySchema = z.custom<MessageEntity>(
  (data) => typeof data === "object",
)

export type AttachmentEntity = {
  sourceId: string
  fileType: FileType
  mimeType: string
  originPath: string
  size: number
  url?: string
  width?: number
  height?: number
  name?: string
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
    }
  | {
      buttonType: "postback"
      postback: string
    }
)

export type MessageCardTemplate = {
  id: string
  title: string
  subtitle?: string
  imageUrl?: string
  buttons?: MessageButtonTemplate[]
}

export type MessageTemplateEntity = {
  type: "template"
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

export const ContentType = {
  text: "text",
  location: "location",
} as const

export type ContentType = (typeof ContentType)[keyof typeof ContentType]

export const FileType = {
  image: "image",
  audio: "audio",
  video: "video",
  file: "file",
} as const

export type FileType = (typeof FileType)[keyof typeof FileType]
