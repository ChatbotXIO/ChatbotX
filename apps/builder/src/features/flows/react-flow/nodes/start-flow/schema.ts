import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  startFlowBlockDefaultValue,
  startFlowBlockSchema,
} from "../../blocks/start-flow/schema"

export const startFlowNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  blocks: z.array(startFlowBlockSchema),
})

export type StartFlowNodeSchema = z.infer<typeof startFlowNodeSchema>

export const startFlowNodeDefaultValue = (
  name = "Start Flow",
): StartFlowNodeSchema => ({
  id: createId(),
  name,
  blocks: [startFlowBlockDefaultValue()],
})
