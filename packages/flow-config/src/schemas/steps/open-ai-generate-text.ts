import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { OpenAIModel } from "./open-ai"
import { StepType } from "./step-action"

export const openAIGenerateTextSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.OPENAI_GENERATE_TEXT),
  model: z.enum(OpenAIModel),
  prompt: z.string().optional(),
  userMessage: z.string(),
  resultCustomFieldId: z.cuid2(),
  aiTriggerIds: z.array(z.cuid2()),
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
