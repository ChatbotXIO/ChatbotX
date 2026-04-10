import { flowEventType, messageEventType } from "@chatbotx.io/flow-config"
import z from "zod"

export const BroadcastEventType = z.union([messageEventType, flowEventType])

export const SequenceEventType = z.union([messageEventType, flowEventType])

export const BroadcastStatsModel = z.object({
  event_id: z.string(),
  workspace_id: z.string(),
  broadcast_id: z.string(),
  contact_inbox_id: z.string(),
  contact_id: z.string(),
  conv_id: z.string(),
  source_id: z.string().default(""),
  channel: z.string().default(""),
  event_type: BroadcastEventType,
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
  event_type: SequenceEventType,
  sequence_id: z.string(),
  step_id: z.string(),
  content: z.string().optional(),
  occurred_at: z.string(),
  inserted_at: z.string(),
})

export type SequenceScheduleEventType = z.infer<
  typeof SequenceScheduleEventModel
>
