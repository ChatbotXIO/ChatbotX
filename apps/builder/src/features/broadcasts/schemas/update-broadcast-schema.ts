import { z } from "zod"

export const updateBroadcastSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type UpdateBroadcastSchema = z.infer<typeof updateBroadcastSchema>
