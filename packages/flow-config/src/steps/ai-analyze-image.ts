import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const AIAnalyzeImageSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.aiAnalyzeImage),
  model: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  inputCfId: z.bigint(),
  outputCfId: z.bigint(),
})
export type AIAnalyzeImageSchema = z.infer<typeof AIAnalyzeImageSchema>

export const AIAnalyzeImageDefaultFn = (
  props?: Partial<AIAnalyzeImageSchema>,
): AIAnalyzeImageSchema => ({
  id: createId(),
  stepType: StepType.aiAnalyzeImage,
  model: "",
  inputCfId: "",
  prompt: "",
  outputCfId: "",
  ...props,
})
