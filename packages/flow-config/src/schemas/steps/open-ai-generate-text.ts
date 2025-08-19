import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { OpenAIModel } from "./open-ai"
import { StepType } from "./step-action"

export const openAIGenerateTextSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OPENAI_GENERATE_TEXT),
  model: z.nativeEnum(OpenAIModel),
  prompt: z.string().optional(),
  userMessage: z.string(),
  resultCustomFieldId: z.string().cuid2(),
  aiTriggerIds: z.array(z.string().cuid2()),
})
export type OpenAIGenerateTextSchema = z.infer<typeof openAIGenerateTextSchema>

export const openAIGenerateTextDefaultFn = (): OpenAIGenerateTextSchema => ({
  id: createId(),
  stepType: StepType.OPENAI_GENERATE_TEXT,
  model: OpenAIModel.GPT4oMini,
  prompt: "",
  userMessage: "",
  resultCustomFieldId: "",
  aiTriggerIds: [],
})
