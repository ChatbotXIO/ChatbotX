import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../../steps/step-action"
import { claudeGenerateTextSchema } from "./ai-actions/claude/generate-text"
import { deepseekGenerateTextSchema } from "./ai-actions/deepseek/generate-text"
import { geminiGenerateTextSchema } from "./ai-actions/gemini/generate-text"
import { openAIGenerateTextSchema } from "./ai-actions/openai/generate-text"

export const performActionStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.performAction),
  steps: z.array(
    z.union([
      openAIGenerateTextSchema,
      geminiGenerateTextSchema,
      claudeGenerateTextSchema,
      deepseekGenerateTextSchema,
    ]),
  ),
})

export type PerformActionStepSchema = z.infer<typeof performActionStepSchema>

export const performActionStepDefaultFn = (): PerformActionStepSchema => ({
  id: createId(),
  stepType: StepType.performAction,
  steps: [],
})
