import z from "zod"

export const getBroadcastStatsRequest = z.object({
  chatbotId: z.string(),
  broadcastId: z.string(),
})

export const getBroadcastStatsResponse = z.object({
  sent: z.number(),
  delivered: z.number(),
  seen: z.number(),
  clicked: z.number(),
  failed: z.number(),
})

export type GetBroadcastStatsRequest = z.infer<typeof getBroadcastStatsRequest>
export type GetBroadcastStatsResponse = z.infer<
  typeof getBroadcastStatsResponse
>
