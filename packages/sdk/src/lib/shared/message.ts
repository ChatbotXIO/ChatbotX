import { z } from "zod"

export interface ContactEntity {
  sourceId: string
  phoneNumber?: string
  name?: string
}

export interface ConversationEntity {
  sourceId: string
  conversationAttributes: Record<string, unknown>
  contact: ContactEntity
}

export const conversationEntitySchema = z.custom<ConversationEntity>((data) => {
  return typeof data === "object"
})

export interface MessageEntity {
  sourceId: string
  contentType: ContentType
  content?: string
  contentAttributes?: MessageLocationEntity | unknown
  attachments?: AttachmentEntity[]
}

export const messageEntitySchema = z.custom<MessageEntity>((data) => {
  return typeof data === "object"
})

export interface AttachmentEntity {
  sourceId: string
  fileType: FileType
  mimeType: string
  originPath: string
  size: number
  publicUrl?: string
  width?: number
  height?: number
  name?: string
}

export interface ExternalMediaResult {
  originPath: string
  size: number
  width?: number
  height?: number
  name?: string
}

export interface MessageLocationEntity {
  latitude: string
  longitude: string
}

export enum ContentType {
  TEXT = "TEXT",
}

export enum FileType {
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
  FILE = "FILE",
}
