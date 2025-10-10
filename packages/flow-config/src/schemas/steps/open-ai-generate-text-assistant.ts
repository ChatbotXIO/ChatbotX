import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const openAIGenerateTextAssistantSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.OPENAI_GENERATE_TEXT_ASSISTANT),
  aiAssistantId: z.cuid2(),
  userMessage: z.string(),
  outputCustomFieldId: z.cuid2(),
})
export type OpenAIGenerateTextAssistantSchema = z.infer<
  typeof openAIGenerateTextAssistantSchema
>

export const openAIGenerateTextAssistantDefaultFn =
  (): OpenAIGenerateTextAssistantSchema => ({
    id: createId(),
    stepType: StepType.OPENAI_GENERATE_TEXT_ASSISTANT,
    aiAssistantId: "",
    userMessage: "",
    outputCustomFieldId: "",
  })
