import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const splitTrafficStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.SPLIT_TRAFFIC),
  value: z.number().int().min(0).max(100),
})

export type SplitTrafficStepSchema = z.infer<typeof splitTrafficStepSchema>

export const splitTrafficStepDefaultFn = (): SplitTrafficStepSchema => ({
  id: createId(),
  stepType: StepType.SPLIT_TRAFFIC,
  value: 100,
})
