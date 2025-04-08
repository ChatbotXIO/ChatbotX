import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import {
  splitTrafficStepDefaultFn,
  splitTrafficStepSchema,
} from "../../steps/split-traffic/schema"

export const splitTrafficNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  steps: z.array(splitTrafficStepSchema),
})

export type SplitTrafficNodeSchema = z.infer<typeof splitTrafficNodeSchema>

export const splitTrafficNodeDefaultFn = (
  name = "Split Traffic",
): SplitTrafficNodeSchema => ({
  id: createId(),
  name,
  steps: [splitTrafficStepDefaultFn(), splitTrafficStepDefaultFn()],
})
