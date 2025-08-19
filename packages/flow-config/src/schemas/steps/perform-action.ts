import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { openAIAnalyzeImageSchema } from "./open-ai-analyze-image"
import { openAIDeleteMessageHistorySchema } from "./open-ai-delete-message-history"
import { openAIGenerateImageSchema } from "./open-ai-generate-image"
import { openAIGenerateTextSchema } from "./open-ai-generate-text"
import { openAIGenerateTextAdvancedSchema } from "./open-ai-generate-text-advanced"
import { openAIGenerateTextAgentSchema } from "./open-ai-generate-text-agent"
import { openAISpeechToTextSchema } from "./open-ai-speech-to-text"
import { openAITextToSpeechSchema } from "./open-ai-text-to-speech"
import { StepType } from "./step-action"

export const performActionStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.PERFORM_ACTION),
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
  stepType: StepType.PERFORM_ACTION,
  steps: [],
})
