import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"
import { openAIGenerateTextSchema } from "./open-ai-generate-text"
import { openAIGenerateTextAgentSchema } from "./open-ai-generate-text-agent"
import { openAIGenerateTextAdvancedSchema } from "./open-ai-generate-text-advanced"
import { openAIAnalyzeImageSchema } from "./open-ai-analyze-image"
import { openAIGenerateImageSchema } from "./open-ai-generate-image"
import { openAISpeechToTextSchema } from "./open-ai-speech-to-text"
import { openAITextToSpeechSchema } from "./open-ai-text-to-speech"
import { openAIDeleteMessageHistorySchema } from "./open-ai-delete-message-history"

export const performActionStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.PerformAction),
  steps: z.array(
    z.union([
      openAIGenerateTextSchema,
      openAIGenerateTextAgentSchema,
      openAIGenerateTextAdvancedSchema,
      openAIAnalyzeImageSchema,
      openAIGenerateImageSchema,
      openAISpeechToTextSchema,
      openAITextToSpeechSchema,
      openAIDeleteMessageHistorySchema,
    ]),
  ),
})

export type PerformActionStepSchema = z.infer<typeof performActionStepSchema>

export const performActionStepDefaultFn = (): PerformActionStepSchema => ({
  id: createId(),
  stepType: StepType.PerformAction,
  steps: [],
})
