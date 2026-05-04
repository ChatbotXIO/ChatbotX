import { z } from "zod"
import type { MetadataPayload } from "../nodes/send-message"

export const messageEventTypeSchema = z.enum([
  "message:sent",
  "message:delivered",
  "message:seen",
  "message:failed",
])
export type MessageEventType = z.infer<typeof messageEventTypeSchema>

export const flowEventTypeSchema = z.enum(["flow:clicked", "flow:ref"])
export type FlowEventType = z.infer<typeof flowEventTypeSchema>

export const contactEventTypeSchema = z.enum([
  "contact:created",
  "contact:deleted",
])
export type ContactEventType = z.infer<typeof contactEventTypeSchema>

export const eventContextSchema = z.object({
  workspaceId: z.string(),
  contactId: z.string(),
  conversationId: z.string(),
  channel: z.string(),
  contactInboxId: z.string().optional(),
  sequenceStepId: z.string().optional(),
})

export type EventContext = z.infer<typeof eventContextSchema>

export const messageActionSchema = z.object({
  flowId: z.string().optional(),
  flowVersionId: z.string().optional(),
  sourceId: z.string().optional(),
  messageId: z.string().optional(),
  messageDetail: z.record(z.string(), z.unknown()).optional(),
})

export type MessageAction = z.infer<typeof messageActionSchema>

export const clickTypeSchema = z.enum(["button", "quick_reply", "magic_link"])
export type ClickType = z.infer<typeof clickTypeSchema>

export const flowClickActionSchema = z.object({
  flowId: z.string(),
  buttonId: z.string().optional(),
  nodeId: z.string().optional(),
  broadcastId: z.string().optional(),
  sequenceStepId: z.string().optional(),
  magicLinkId: z.string().optional(),
  clickType: clickTypeSchema,
})
export type FlowClickAction = z.infer<typeof flowClickActionSchema>

export const refLinkActionSchema = z.object({
  refId: z.string(),
  refType: z.enum(["entryPoint"]),
})

export type RefLinkAction = z.infer<typeof refLinkActionSchema>

const baseMessagePayloadSchema = z.object({
  context: eventContextSchema,
  action: messageActionSchema,
  stepId: z.string().optional(),
  nodeId: z.string().optional(),
  occurredAt: z.date(),
  metadata: z.custom<MetadataPayload>().optional(),
})

export const sentPayloadSchema = baseMessagePayloadSchema.extend({})
export const failedPayloadSchema = baseMessagePayloadSchema.extend({
  errorData: z.unknown(),
})
export const deliveredPayloadSchema = baseMessagePayloadSchema.extend({})
export const seenPayloadSchema = baseMessagePayloadSchema.extend({})

export const messageEventSchemas = {
  [messageEventTypeSchema.enum["message:sent"]]: sentPayloadSchema,
  [messageEventTypeSchema.enum["message:failed"]]: failedPayloadSchema,
  [messageEventTypeSchema.enum["message:delivered"]]: deliveredPayloadSchema,
  [messageEventTypeSchema.enum["message:seen"]]: seenPayloadSchema,
} as const

export const clickedPayloadSchema = z.object({
  context: eventContextSchema,
  action: flowClickActionSchema,
  stepId: z.string().optional(),
  nodeId: z.string().optional(),
  occurredAt: z.date(),
})
export type ClickedPayload = z.infer<typeof clickedPayloadSchema>

export const refLinkPayloadSchema = z.object({
  context: eventContextSchema,
  action: refLinkActionSchema,
  occurredAt: z.date(),
})

export const flowEventSchemas = {
  [flowEventTypeSchema.enum["flow:clicked"]]: clickedPayloadSchema,
  [flowEventTypeSchema.enum["flow:ref"]]: refLinkPayloadSchema,
} as const

export const contactSenderTypeSchema = z.enum(["bot", "human"])
export type ContactSenderTypeSchema = z.infer<typeof contactSenderTypeSchema>

const baseContactPayloadSchema = z.object({
  workspaceId: z.string(),
  contactId: z.string(),
  occurredAt: z.union([z.date(), z.string(), z.number()]),
  adminId: z.string().optional(),
  channel: z.string().nullish(),
  country: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  senderType: contactSenderTypeSchema.optional(),
  source: z.string().nullish(),
  sourceId: z.string().nullish(),
})

export const contactCreatedPayloadSchema = baseContactPayloadSchema.extend({})
export const contactDeletedPayloadSchema = baseContactPayloadSchema.extend({})

export const contactEventSchemas = {
  [contactEventTypeSchema.enum["contact:created"]]: contactCreatedPayloadSchema,
  [contactEventTypeSchema.enum["contact:deleted"]]: contactDeletedPayloadSchema,
} as const
