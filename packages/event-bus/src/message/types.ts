import type { z } from "zod"
import type { BaseEventListener, BaseEventType, InferEventMap } from "../types"
import type {
  messageEventSchemas,
  messageSourceMetadataSchema,
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

export type MessageSentPayload =
  MessageEventMap[(typeof MessageEventType)["SENT"]]

export type MessageFailedPayload =
  MessageEventMap[(typeof MessageEventType)["FAILED"]]

export type MessageDeliveredPayload =
  MessageEventMap[(typeof MessageEventType)["DELIVERED"]]

export type MessageSeenPayload =
  MessageEventMap[(typeof MessageEventType)["SEEN"]]

export interface MessageEventListener
  extends BaseEventListener<MessagePayload> {}

export type MessageEvenTypeMap = Record<
  MessageEventType,
  MessageEventListener[]
>
