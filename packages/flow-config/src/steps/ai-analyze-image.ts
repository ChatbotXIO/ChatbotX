import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const AIAnalyzeImageSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.aiAnalyzeImage),
  model: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  inputCfId: z.cuid2(),
  outputCfId: z.cuid2(),
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
