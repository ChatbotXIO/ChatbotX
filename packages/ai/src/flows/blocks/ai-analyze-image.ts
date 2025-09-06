import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { baseAISchema } from "./ai-base-block"

const stepType = "AI_ANALYZE_IMAGE"

export const aiAnalyzeImageSchema = baseAISchema.extend({
  stepType: z.literal(stepType),
  inputCustomFieldId: z.string().cuid2(),
  prompt: z.string().min(1).max(1000),
  outputCustomFieldId: z.string().cuid2(),
})
export type AIAnalyzeImageSchema = z.infer<typeof aiAnalyzeImageSchema>

export const AIAnalyzeImageDefaultFn = (
  props: Partial<AIAnalyzeImageSchema>,
): AIAnalyzeImageSchema => ({
  id: createId(),
  stepType,
  model: "",
  inputCustomFieldId: "",
  prompt: "",
  outputCustomFieldId: "",
  ...props,
})
