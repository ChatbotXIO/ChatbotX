import type { z } from "zod"
import type { BaseEventListener, BaseEventType, InferEventMap } from "../types"
import type {
  deliveredPayloadSchema,
  failedPayloadSchema,
  messageEventSchemas,
  messageSourceMetadataSchema,
  seenPayloadSchema,
  sentPayloadSchema,
} from "./schemas"

export const MessageEventType: BaseEventType = {
  SENT: "message:sent",
  FAILED: "message:failed",
  DELIVERED: "message:delivered",
  SEEN: "message:seen",
} as const

export type MessageEventType =
  (typeof MessageEventType)[keyof typeof MessageEventType]

export type MessageSourceMetadata = z.infer<typeof messageSourceMetadataSchema>

export type MessageEventMap = InferEventMap<typeof messageEventSchemas>
export type MessagePayload = MessageEventMap[MessageEventType]

export type MessageSentPayload = z.infer<typeof sentPayloadSchema>
export type MessageFailedPayload = z.infer<typeof failedPayloadSchema>
export type MessageDeliveredPayload = z.infer<typeof deliveredPayloadSchema>
export type MessageSeenPayload = z.infer<typeof seenPayloadSchema>

export interface MessageEventListener
  extends BaseEventListener<MessagePayload> {}

export type MessageEvenTypeMap = Record<
  MessageEventType,
  MessageEventListener[]
>
