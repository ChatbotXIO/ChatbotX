import { flowEventType, messageEventType } from "@chatbotx.io/flow-config"
import z from "zod"

export const BaseEventType = z.union([messageEventType, flowEventType])

export const BroadcastStatsModel = z.object({
  event_id: z.string(),
  workspace_id: z.string(),
  broadcast_id: z.string(),
  contact_inbox_id: z.string(),
  contact_id: z.string(),
  conv_id: z.string(),
  source_id: z.string().default(""),
  channel: z.string().default(""),
  event_type: BaseEventType,
  content: z.string().optional(),
  occurred_at: z.string(),
  inserted_at: z.string(),
})

export type BroadcastStatsType = z.infer<typeof BroadcastStatsModel>

export type ClickHouseContactResponseRow = Pick<
  BroadcastStatsType,
  "contact_id" | "content"
>

export const SequenceScheduleEventModel = z.object({
  event_id: z.string(),
  workspace_id: z.string(),
  contact_inbox_id: z.string(),
  contact_id: z.string(),
  conv_id: z.string(),
  source_id: z.string().default(""),
  channel: z.string().default(""),
  event_type: BaseEventType,
  sequence_id: z.string(),
  step_id: z.string(),
  content: z.string().optional(),
  occurred_at: z.string(),
  inserted_at: z.string(),
})

export type SequenceScheduleEventType = z.infer<
  typeof SequenceScheduleEventModel
>

export const FlowStatEventModel = z.object({
  event_id: z.string(),
  workspace_id: z.string(),
  contact_inbox_id: z.string(),
  contact_id: z.string(),
  source_id: z.string().default(""),
  event_type: BaseEventType,
  flow_id: z.string(),
  analytics_id: z.string(),
  node_id: z.string(),
  button_id: z.string().default(""),
  ref_id: z.string().default(""),
  ref_type: z.string().default(""),
  content: z.string().optional(),
  occurred_at: z.string(),
  inserted_at: z.string(),
})

export type FlowStatEventType = z.infer<typeof FlowStatEventModel>

export const FlowNodeContactStateModel = z.object({
  workspace_id: z.string(),
  flow_id: z.string(),
  analytics_id: z.string(),
  node_id: z.string(),
  button_id: z.string().default(""),
  contact_id: z.string(),
  contact_inbox_id: z.string(),
  sent_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  seen_at: z.string().nullable(),
  clicked_at: z.string().nullable(),
  version: z.number(),
  updated_at: z.string(),
})

export type FlowNodeContactStateType = z.infer<typeof FlowNodeContactStateModel>
