import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"

export const splitTrafficBlockSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.enum([ActionType.SplitTraffic]),
  value: z.number().int().min(0).max(100),
})

export type SplitTrafficBlockSchema = z.infer<typeof splitTrafficBlockSchema>

export const splitTrafficBlockDefaultValue = (): SplitTrafficBlockSchema => ({
  id: createId(),
  actionType: ActionType.SplitTraffic,
  value: 100,
})
