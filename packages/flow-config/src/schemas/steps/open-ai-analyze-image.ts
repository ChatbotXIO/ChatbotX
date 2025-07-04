import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { OpenAIModel, openAISchema } from "./open-ai"
import { StepType } from "./step-action"

export const openAIAnalyzeImageSchema = openAISchema.extend({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.OPENAI_ANALYZE_IMAGE),
  model: z.nativeEnum(OpenAIModel),
  inputCustomFieldId: z.string().cuid2(),
  prompt: z.string().min(1).max(1000),
  outputCustomFieldId: z.string().cuid2(),
})
export type OpenAIAnalyzeImageSchema = z.infer<typeof openAIAnalyzeImageSchema>

export const openAIAnalyzeImageDefaultFn = (): OpenAIAnalyzeImageSchema => ({
  id: createId(),
  stepType: StepType.OPENAI_ANALYZE_IMAGE,
  model: OpenAIModel.GPT4oMini,
  inputCustomFieldId: "",
  prompt: "",
  outputCustomFieldId: "",
})
