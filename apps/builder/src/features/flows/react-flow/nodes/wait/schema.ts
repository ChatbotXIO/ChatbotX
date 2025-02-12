import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  waitBlockDefaultValue,
  waitBlockSchema,
} from "../../blocks/wait/schema"

export const waitNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  blocks: z.array(waitBlockSchema),
})

export type WaitNodeSchema = z.infer<typeof waitNodeSchema>

export const waitNodeDefaultValue = (name = "Wait"): WaitNodeSchema => ({
  id: createId(),
  name,
  blocks: [waitBlockDefaultValue()],
})
