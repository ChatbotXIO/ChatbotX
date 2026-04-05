import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const AIAnalyzeImageSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiAnalyzeImage),
  model: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  inputCfId: zodBigintAsString(),
  outputCfId: zodBigintAsString(),
})
export type AIAnalyzeImageSchema = z.infer<typeof AIAnalyzeImageSchema>

export const AIAnalyzeImageDefaultFn = (
  props?: Partial<AIAnalyzeImageSchema>,
): AIAnalyzeImageSchema => ({
  id: createId(),
  stepType: stepTypes.enum.aiAnalyzeImage,
  model: "",
  inputCfId: "",
  prompt: "",
  outputCfId: "",
  ...props,
})
