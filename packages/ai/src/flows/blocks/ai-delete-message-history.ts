import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { baseAISchema } from "./ai-base-block"

const stepType = "AI_DELETE_MESSAGE_HISTORY"

export const aiDeleteMessageHistorySchema = baseAISchema.extend({
  stepType: z.literal(stepType),
})

export type AIDeleteMessageHistorySchema = z.infer<
  typeof aiDeleteMessageHistorySchema
>

export const aiDeleteMessageHistoryDefaultFn = (
  props: Partial<AIDeleteMessageHistorySchema>,
): AIDeleteMessageHistorySchema => ({
  id: createId(),
  stepType,
  model: "",
  ...props,
})
