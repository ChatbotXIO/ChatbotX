import { z } from "zod"

export type IncomingContact = {
  sourceId: string
  phoneNumber?: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
  gender?: string
}

export type OutgoingContact = {
  id: bigint
  sourceId: string | null
  phoneNumber: string | null
  firstName: string | null
  lastName: string | null
  email: string | null
  avatar: string | null
  gender?: string
}

export type IncomingConversation = {
  sourceId: string
  conversationAttributes: { [x: string]: unknown }
  contact: IncomingContact
}

export type OutgoingConversation = {
  id: bigint
  chatbotId: bigint
  conversationAttributes: { [x: string]: unknown } | null
  sourceId: string | null
  inboxId: bigint
  contactId: bigint
  contact?: OutgoingContact
}

export const conversationEntitySchema = z.custom<IncomingConversation>(
  (data) => typeof data === "object",
)

export type OutgoingMessage = {
  id: bigint
  chatbotId: bigint
  conversationId: bigint
  contentType: ContentType
  text: string | null
  attachments?: OutgoingAttachment[]
  inboxId: bigint
  clientId?: bigint | null
  messageType: "outgoing" | "incoming" | "activity"
}

export const MessageType = {
  incoming: "incoming",
  outgoing: "outgoing",
} as const
export type MessageType = (typeof MessageType)[keyof typeof MessageType]

export type IncomingMessage = {
  sourceId: string
  messageType: MessageType
  contentType: ContentType
  content?: string
  contentAttributes?:
    | MessageLocationEntity
    | MessageTemplateEntity
    | { [x: string]: unknown }
  attachments?: IncomingAttachment[]
  clientId?: bigint | null
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
