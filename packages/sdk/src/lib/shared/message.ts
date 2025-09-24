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

export const conversationEntitySchema = z.custom<ConversationEntity>((data) => {
  return typeof data === "object"
})

export type OutgoingMessageEntity = {
  chatbotId: string
  conversationId: string
  contentType: ContentType
  content?: string
  attachments?: AttachmentEntity[]
}

export const MessageType = {
  INCOMING: "INCOMING",
  OUTGOING: "OUTGOING",
} as const
export type MessageType = (typeof MessageType)[keyof typeof MessageType]

export type MessageEntity = {
  sourceId: string
  messageType: MessageType
  contentType: ContentType
  content?: string
  contentAttributes?: MessageLocationEntity | unknown
  attachments?: AttachmentEntity[]
  clientId?: string | null
}

export const MessageEntitySchema = z.custom<MessageEntity>((data) => {
  return typeof data === "object"
})

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

export const ContentType = {
  TEXT: "TEXT",
  LOCATION: "LOCATION",
} as const

export type ContentType = (typeof ContentType)[keyof typeof ContentType]

export const FileType = {
  IMAGE: "IMAGE",
  AUDIO: "AUDIO",
  VIDEO: "VIDEO",
  DOCUMENT: "DOCUMENT",
} as const

export type FileType = (typeof FileType)[keyof typeof FileType]
