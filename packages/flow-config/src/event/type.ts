import type { z } from "zod"
import type {
  clickedPayloadSchema,
  deliveredPayloadSchema,
  FlowEventType,
  failedPayloadSchema,
  flowEventSchemas,
  MessageReceivedPayload,
  messageEventSchemas,
  refLinkPayloadSchema,
  seenPayloadSchema,
  sentPayloadSchema,
} from "./schema"

export type InferEventMap<T extends Record<string, z.ZodType>> = {
  [K in keyof T]: z.infer<T[K]>
}

export interface BaseEventListener<TPayload = never> {
  handler?(payloads: TPayload[]): Promise<void> | void
  name: string
  priority?: number
}

export type MessageEventMap = InferEventMap<typeof messageEventSchemas>

export type MessageSentPayload = z.infer<typeof sentPayloadSchema>
export type MessageFailedPayload = z.infer<typeof failedPayloadSchema>
export type MessageDeliveredPayload = z.infer<typeof deliveredPayloadSchema>
export type MessageSeenPayload = z.infer<typeof seenPayloadSchema>
export type { MessageReceivedPayload } from "./schema"

export type MessagePayload =
  | MessageSentPayload
  | MessageFailedPayload
  | MessageDeliveredPayload
  | MessageSeenPayload

export interface MessageEventListener
  extends BaseEventListener<MessagePayload> {}

export interface MessageReceivedEventListener
  extends BaseEventListener<MessageReceivedPayload> {}

export type MessageEvenTypeMap = {
  "message:sent": MessageEventListener[]
  "message:delivered": MessageEventListener[]
  "message:seen": MessageEventListener[]
  "message:failed": MessageEventListener[]
  "message:received": MessageReceivedEventListener[]
}

export type FlowEventMap = InferEventMap<typeof flowEventSchemas>

export type FlowClickedPayload = z.infer<typeof clickedPayloadSchema>
export type RefLinkPayload = z.infer<typeof refLinkPayloadSchema>

export type FlowPayload = FlowClickedPayload | RefLinkPayload

export interface FlowEventListener extends BaseEventListener<FlowPayload> {}

export type FlowEvenTypeMap = Record<FlowEventType, FlowEventListener[]>
