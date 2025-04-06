import { StepType } from "@/features/flows/react-flow/steps/step-action"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const openAIGenerateTextAssistantSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OpenAIGenerateTextAssistant),
  aiAssistantId: z.string().cuid2(),
  userMessage: z.string(),
  resultCustomFieldId: z.string().cuid2(),
})
export type OpenAIGenerateTextAssistantSchema = z.infer<
  typeof openAIGenerateTextAssistantSchema
>

export const openAIGenerateTextAssistantDefaultFn =
  (): OpenAIGenerateTextAssistantSchema => ({
    id: createId(),
    stepType: StepType.OpenAIGenerateTextAssistant,
    aiAssistantId: "",
    userMessage: "",
    resultCustomFieldId: "",
  })
