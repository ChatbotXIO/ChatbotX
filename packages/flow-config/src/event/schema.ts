import { z } from "zod"
import type { MetadataPayload } from "../nodes/send-message"

export const messageEventType = z.enum([
  "message:sent",
  "message:delivered",
  "message:seen",
  "message:failed",
])

export const flowEventType = z.enum(["flow:clicked"])

export const MessageEventType = messageEventType.enum

export type MessageEventType = z.infer<typeof messageEventType>

export const FlowEventType = flowEventType.enum

export type FlowEventType = z.infer<typeof flowEventType>

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

export const flowActionSchema = z.object({
  flowId: z.string(),
  buttonId: z.string().optional(),
  nodeId: z.string().optional(),
  broadcastId: z.string().optional(),
  clickType: z.enum(["button", "quick_reply"]),
})

export type FlowAction = z.infer<typeof flowActionSchema>

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
  [MessageEventType["message:sent"]]: sentPayloadSchema,
  [MessageEventType["message:failed"]]: failedPayloadSchema,
  [MessageEventType["message:delivered"]]: deliveredPayloadSchema,
  [MessageEventType["message:seen"]]: seenPayloadSchema,
} as const

export const clickedPayloadSchema = z.object({
  context: eventContextSchema,
  action: flowActionSchema,
  stepId: z.string().optional(),
  nodeId: z.string().optional(),
  occurredAt: z.date(),
})
export type ClickedPayload = z.infer<typeof clickedPayloadSchema>

export const flowEventSchemas = {
  [FlowEventType["flow:clicked"]]: clickedPayloadSchema,
} as const
