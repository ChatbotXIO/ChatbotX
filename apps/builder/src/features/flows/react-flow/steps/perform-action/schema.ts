import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"
import { openAIGenerateTextStep } from "../open-ai-generate-text"
import { openAIGenerateTextAgentStep } from "../open-ai-generate-text-agent"
import { openAIGenerateTextAdvancedStep } from "../open-ai-generate-text-advanced"
import { openAIGenerateImageStep } from "../open-ai-generate-image"
import { openAIAnalyzeImageStep } from "../open-ai-analyze-image"
import { openAITextToSpeechStep } from "../open-ai-text-to-speech"
import { openAISpeechToTextStep } from "../open-ai-speech-to-text"
import { openAIDeleteMessageHistoryStep } from "../open-ai-delete-message-history"

export const performActionStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.PerformAction),
  steps: z.array(
    z.union([
      openAIGenerateTextStep.validator,
      openAIGenerateTextAgentStep.validator,
      openAIGenerateTextAdvancedStep.validator,
      openAIAnalyzeImageStep.validator,
      openAIGenerateImageStep.validator,
      openAISpeechToTextStep.validator,
      openAITextToSpeechStep.validator,
      openAIDeleteMessageHistoryStep.validator,
    ]),
  ),
})

export type PerformActionStepSchema = z.infer<typeof performActionStepSchema>

export const performActionStepDefaultFn = (): PerformActionStepSchema => ({
  id: createId(),
  stepType: StepType.PerformAction,
  steps: [],
})
