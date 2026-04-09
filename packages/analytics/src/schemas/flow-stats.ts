import type { FlowEventType, MessageEventType } from "@chatbotx.io/flow-config"
import { flowEventType, messageEventType } from "@chatbotx.io/flow-config"
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
  "flow:clicked": z.number(),
  "message:failed": z.number(),
})
export type GetFlowStatsResponse = z.infer<typeof getFlowStatsResponse>

export const flowNodeEventType = z.union([messageEventType, flowEventType])
export type FlowNodeEventType = MessageEventType | FlowEventType

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

export const stepResponse = z.object({
  step: z.object({
    "message:sent": z.number(),
    "message:delivered": z.number(),
    "message:seen": z.number(),
    "flow:clicked": z.number(),
    "message:failed": z.number(),
  }),
  buttons: z.record(z.string(), buttonResponse),
})
export type StepResponse = z.infer<typeof stepResponse>

export const flowNodeStatsResponse = z.record(z.string(), stepResponse)
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
  eventType: flowNodeEventType,
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
// CLICKHOUSE ROW SCHEMAS (Shared across analytics)
// ══════════════════════════════════════════════════

export const clickHouseStatsRowSchema = z.object({
  event_type: z.string(),
  count: z.string(),
})
export type ClickHouseStatsRow = z.infer<typeof clickHouseStatsRowSchema>

export const clickHouseButtonStatsRowSchema = z.object({
  button_id: z.string(),
  clicks: z.string(),
})
export type ClickHouseButtonStatsRow = z.infer<
  typeof clickHouseButtonStatsRowSchema
>

export const clickHouseContactRowSchema = z.object({
  contact_inbox_id: z.string(),
  contact_id: z.string(),
  content: z.string().nullable(),
  max_occurred_at: z.string(),
  conv_id: z.string().optional(),
  source_id: z.string().optional(),
  channel: z.string().optional(),
})
export type ClickHouseContactRow = z.infer<typeof clickHouseContactRowSchema>

// ══════════════════════════════════════════════════
// REPOSITORY UPDATE SCHEMAS
// ══════════════════════════════════════════════════

export const flowNodeStatTimestampField = z.enum([
  "deliveredAt",
  "failedAt",
  "clickedAt",
])
export type FlowNodeStatTimestampField = z.infer<
  typeof flowNodeStatTimestampField
>

export const flowNodeStatUpdateItemSchema = z.object({
  workspaceId: z.string(),
  flowId: z.string(),
  analyticsId: z.string(),
  nodeId: z.string(),
  contactId: z.string(),
  contactInboxId: z.string(),
})
export type FlowNodeStatUpdateItem = z.infer<
  typeof flowNodeStatUpdateItemSchema
>

export const flowNodeStatClickedItemSchema =
  flowNodeStatUpdateItemSchema.extend({
    buttonId: z.string(),
  })
export type FlowNodeStatClickedItem = z.infer<
  typeof flowNodeStatClickedItemSchema
>

export const flowNodeStatSeenItemSchema = z.object({
  contactInboxId: z.string(),
  occurredAt: z.date(),
})
export type FlowNodeStatSeenItem = z.infer<typeof flowNodeStatSeenItemSchema>
