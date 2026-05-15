import {
  flowEventTypeSchema,
  messageEventTypeSchema,
} from "@chatbotx.io/flow-config"
import { z } from "zod"

export const flowStatsRequest = z.object({
  workspaceId: z.string(),
  flowId: z.string(),
})
export type FlowStatsRequest = z.infer<typeof flowStatsRequest>

export const getFlowStatsResponse = z.object({
  "message:sent": z.number(),
  "message:delivered": z.number(),
  "message:seen": z.number(),
  "flow:clicked": z.object({
    clicked: z.number(),
    totalUsers: z.number(),
  }),
  "message:failed": z.number(),
})
export type GetFlowStatsResponse = z.infer<typeof getFlowStatsResponse>

export const flowNodeEventTypes = z.enum([
  ...messageEventTypeSchema.options,
  ...flowEventTypeSchema.options,
])
export type FlowNodeEventType = z.infer<typeof flowNodeEventTypes>

export const flowContactStatsRequest = z.object({
  workspaceId: z.string(),
  flowId: z.string(),
  eventType: flowNodeEventTypes.optional(),
  nodeId: z.string().optional(),
})
export type FlowContactStatsRequest = z.infer<typeof flowContactStatsRequest>

export const getFlowNodeStatsRequest = z.object({
  workspaceId: z.string(),
  flowId: z.string(),
  analyticsId: z.string(),
  stepId: z.string(),
})
export type GetFlowNodeStatsRequest = z.infer<typeof getFlowNodeStatsRequest>

export const buttonResponse = z.object({
  buttonId: z.string(),
  clicks: z.number(),
})

export const nodeResponse = z.object({
  node: getFlowStatsResponse,
  buttons: z.record(z.string(), buttonResponse),
})
export type NodeResponse = z.infer<typeof nodeResponse>

export const flowNodeStatsResponse = z.record(z.string(), nodeResponse)
export type FlowNodeStatsResponse = z.infer<typeof flowNodeStatsResponse>

export type FlowNodeStats = GetFlowStatsResponse
export type RemoveFlowStatsRequest = FlowStatsRequest

export const getFlowNodeButtonStatsRequest = z.object({
  workspaceId: z.string(),
  flowId: z.string(),
  analyticsId: z.string(),
  stepId: z.string(),
})
export type GetFlowNodeButtonStatsRequest = z.infer<
  typeof getFlowNodeButtonStatsRequest
>

export const flowNodeButtonStatsItem = z.object({
  buttonId: z.string(),
  clicks: z.number(),
})
export const getFlowNodeButtonStatsResponse = z.object({
  buttons: z.array(flowNodeButtonStatsItem),
})
export type GetFlowNodeButtonStatsResponse = z.infer<
  typeof getFlowNodeButtonStatsResponse
>

export const listFlowNodeContactsRequest = z.object({
  workspaceId: z.string(),
  flowId: z.string(),
  analyticsId: z.string(),
  stepId: z.string(),
  eventType: flowNodeEventTypes,
  buttonId: z.string().optional(),
  total: z.number().optional(),
  page: z.number().default(1),
  perPage: z.number().default(20),
})
export type ListFlowNodeContactsRequest = z.infer<
  typeof listFlowNodeContactsRequest
>

export const flowNodeContactData = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  sourceId: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: z.string().nullable(),
  conversationId: z.string(),
  occurredAt: z.string(),
})
export type FlowNodeContactData = z.infer<typeof flowNodeContactData>

export const listFlowNodeContactsResponse = z.object({
  data: z.array(flowNodeContactData),
  total: z.number(),
  page: z.number(),
  pageCount: z.number(),
})
export type ListFlowNodeContactsResponse = z.infer<
  typeof listFlowNodeContactsResponse
>

// ══════════════════════════════════════════════════
// REPOSITORY UPDATE SCHEMAS
// ══════════════════════════════════════════════════

export const flowNodeStatTimestampField = z.enum([
  "deliveredAt",
  "failedAt",
  "clickedAt",
  "seenAt",
])
export type FlowNodeStatTimestampField = z.infer<
  typeof flowNodeStatTimestampField
>

// Bulk update schemas - use contactInboxId as key for updates
export const FlowNodeStatItemSchema = z.object({
  id: z.string().optional(),
  workspaceId: z.string(),
  flowId: z.string(),
  analyticsId: z.string(),
  nodeId: z.string(),
  contactId: z.string(),
  contactInboxId: z.string(),
  eventType: flowNodeEventTypes,
  occurredAt: z.union([z.date()]),
})
export type FlowNodeStatItem = z.infer<typeof FlowNodeStatItemSchema>

export const flowNodeStatClickedItemSchema = FlowNodeStatItemSchema.extend({
  buttonId: z.string(),
})
export type FlowNodeStatClickedItem = z.infer<
  typeof flowNodeStatClickedItemSchema
>

export const flowNodeStatSeenItemSchema = z.object({
  id: z.string(),
  seenAt: z.date(),
})
export type FlowNodeStatSeenItem = z.infer<typeof flowNodeStatSeenItemSchema>

export const FlowNodeStatFailedItemSchema = FlowNodeStatItemSchema.extend({
  errorContent: z.string(),
})
export type FlowNodeStatFailedItem = z.infer<
  typeof FlowNodeStatFailedItemSchema
>
