import type { z } from "zod"
import type {
  ContactEventType,
  clickedPayloadSchema,
  contactCreatedPayloadSchema,
  contactDeletedPayloadSchema,
  contactEventSchemas,
  deliveredPayloadSchema,
  FlowEventType,
  failedPayloadSchema,
  flowEventSchemas,
  MessageEventType,
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

export type MessagePayload =
  | MessageSentPayload
  | MessageFailedPayload
  | MessageDeliveredPayload
  | MessageSeenPayload

export interface MessageEventListener
  extends BaseEventListener<MessagePayload> {}

export type MessageEvenTypeMap = Record<
  MessageEventType,
  MessageEventListener[]
>

export type FlowEventMap = InferEventMap<typeof flowEventSchemas>

export type FlowClickedPayload = z.infer<typeof clickedPayloadSchema>
export type RefLinkPayload = z.infer<typeof refLinkPayloadSchema>

export type FlowPayload = FlowClickedPayload | RefLinkPayload

export interface FlowEventListener extends BaseEventListener<FlowPayload> {}

export type FlowEvenTypeMap = Record<FlowEventType, FlowEventListener[]>

export type ContactEventMap = InferEventMap<typeof contactEventSchemas>

export type ContactCreatedPayload = z.infer<typeof contactCreatedPayloadSchema>
export type ContactDeletedPayload = z.infer<typeof contactDeletedPayloadSchema>

export type ContactPayload = ContactCreatedPayload | ContactDeletedPayload

export interface ContactEventListener
  extends BaseEventListener<ContactPayload> {}

export type ContactEvenTypeMap = Record<
  ContactEventType,
  ContactEventListener[]
>
