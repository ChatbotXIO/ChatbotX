import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ActionType } from "../../action-type"
import {
  splitTrafficBlockDefaultValue,
  splitTrafficBlockSchema,
} from "../../blocks/split-traffic/schema"

export const splitTrafficNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  actionType: z.enum([ActionType.SplitTraffic]),
  blocks: z.array(splitTrafficBlockSchema),
})

export type SplitTrafficNodeSchema = z.infer<typeof splitTrafficNodeSchema>

export const splitTrafficNodeDefaultValue = (
  name = "Split Traffic",
): SplitTrafficNodeSchema => ({
  id: createId(),
  name,
  actionType: ActionType.SplitTraffic,
  blocks: [splitTrafficBlockDefaultValue(), splitTrafficBlockDefaultValue()],
})
