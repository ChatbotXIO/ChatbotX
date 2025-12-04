import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../../steps/step-action"
import { aiGenerateTextSchema } from "./ai-actions/generate-text"

export const performActionStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.performAction),
  steps: z.array(aiGenerateTextSchema),
})

export type PerformActionStepSchema = z.infer<typeof performActionStepSchema>

export const performActionStepDefaultFn = (): PerformActionStepSchema => ({
  id: createId(),
  stepType: StepType.performAction,
  steps: [],
})
