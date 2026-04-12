import { flowEventType, messageEventType } from "@chatbotx.io/flow-config"
import z from "zod"

export const BaseEventType = z.enum([
  ...Object.values(messageEventType.enum),
  ...Object.values(flowEventType.enum),
])

export const BroadcastStatsModel = z.object({
  workspace_id: z.string(),
  broadcast_id: z.string(),
  contact_inbox_id: z.string(),
  event_type: BaseEventType,
  batch_id: z.number().default(1),
  occurred_at: z.string(),
  inserted_at: z.string(),
})

export type BroadcastStatsType = z.infer<typeof BroadcastStatsModel>

export const SequenceScheduleEventModel = z.object({
  workspace_id: z.string(),
  contact_inbox_id: z.string(),
  event_type: BaseEventType,
  sequence_id: z.string(),
  step_id: z.string(),
  occurred_at: z.string(),
  inserted_at: z.string(),
})

export type SequenceScheduleEventType = z.infer<
  typeof SequenceScheduleEventModel
>

export const FlowNodeStatsModel = z.object({
  workspace_id: z.string(),
  flow_id: z.string(),
  analytics_id: z.string(),
  node_id: z.string(),
  button_id: z.string().default(""),
  contact_inbox_id: z.string(),
  event_type: BaseEventType,
  occurred_at: z.string(),
  inserted_at: z.string(),
})

export type FlowNodeStatsType = z.infer<typeof FlowNodeStatsModel>
