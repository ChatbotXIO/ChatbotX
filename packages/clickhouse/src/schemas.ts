import z from "zod"

export const BroadcastStatsModel = z.object({
  event_id: z.string(),
  chatbot_id: z.string(),
  broadcast_id: z.string(),
  contact_id: z.string(),
  conv_id: z.string(),
  event_type: z.string(),
  content: z.string().optional(),
  occurred_at: z.string(),
  inserted_at: z.string(),
})

export type BroadcastStatsType = z.infer<typeof BroadcastStatsModel>

export type ClickHouseContactResponseRow = Pick<
  BroadcastStatsType,
  "contact_id" | "content"
>
