import { channelTypes } from "@chatbotx.io/database/partials"
import type { FlowEventType, MessageEventType } from "@chatbotx.io/flow-config"
import {
  clickedPayloadSchema,
  flowEventType,
  messageEventType,
} from "@chatbotx.io/flow-config"
import { z } from "zod"

export const sequenceStepEventType = z.union([messageEventType, flowEventType])

export type SequenceStepEventType = MessageEventType | FlowEventType

export const getSequenceStepStatsRequest = z.object({
  workspaceId: z.string(),
  sequenceId: z.string(),
  stepId: z.string(),
})

export type GetSequenceStepStatsRequest = z.infer<
  typeof getSequenceStepStatsRequest
>

export const getSequenceStepStatsResponse = z.object({
  "message:sent": z.number(),
  "message:delivered": z.number(),
  "message:seen": z.number(),
  "flow:clicked": z.number(),
  "message:failed": z.number(),
})

export type GetSequenceStepStatsResponse = z.infer<
  typeof getSequenceStepStatsResponse
>
export type SequenceStepStats = GetSequenceStepStatsResponse

export const listSequenceStepContactsRequest = z.object({
  workspaceId: z.string(),
  sequenceId: z.string(),
  stepId: z.string(),
  eventType: sequenceStepEventType,
  total: z.number().optional(),
  page: z.number().default(1),
  perPage: z.number().default(20),
})

export type ListSequenceStepContactsRequest = z.infer<
  typeof listSequenceStepContactsRequest
>

export const sequenceStepContactResource = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  sourceId: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: z.enum(channelTypes.enum),
  errorContent: z.string().nullable(),
  occurredAt: z.string(),
})

export type SequenceStepContactResource = z.infer<
  typeof sequenceStepContactResource
>

export const sequenceStepContactData = sequenceStepContactResource.extend({
  conversationId: z.string(),
})

export type SequenceStepContactData = z.infer<typeof sequenceStepContactData>

export const listSequenceStepContactsResponse = z.object({
  data: z.array(sequenceStepContactData),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})

export type ListSequenceStepContactsResponse = z.infer<
  typeof listSequenceStepContactsResponse
>

export const sequenceSchemaPayload = clickedPayloadSchema.extend({
  metadata: z.object({
    sequenceStepId: z.string().optional(),
  }),
})

export type SequenceSchemaPayload = z.infer<typeof sequenceSchemaPayload>

// Bulk update schemas - use contactInboxId as key
export const sequenceBulkUpdateItemSchema = z.object({
  sequenceId: z.string(),
  stepId: z.string(),
  contactInboxId: z.string(),
  occurredAt: z.date(),
})
export type SequenceBulkUpdateItem = z.infer<
  typeof sequenceBulkUpdateItemSchema
>

export const sequenceFailedBulkUpdateItemSchema =
  sequenceBulkUpdateItemSchema.extend({
    errorContent: z.string(),
  })
export type SequenceFailedBulkUpdateItem = z.infer<
  typeof sequenceFailedBulkUpdateItemSchema
>
