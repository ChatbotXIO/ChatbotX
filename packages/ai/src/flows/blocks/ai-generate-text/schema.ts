import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { baseAISchema, baseAISettingsSchema } from "../ai-base-block"

const stepType = "OPENAI_GENERATE_TEXT"

export const aiGenerateTextSchema = baseAISchema
  .merge(baseAISettingsSchema)
  .extend({
    stepType: z.literal(stepType),
    instructions: z.string().trim(),
    input: z.string().trim().min(1),
    outputCFId: z.string().cuid2(),
    aiToolIds: z.array(z.string().cuid2()),
    rememberConversation: z.boolean(),
  })
export type AIGenerateTextSchema = z.infer<typeof aiGenerateTextSchema>

export const aiGenerateTextDefaultFn = (): AIGenerateTextSchema => ({
  id: createId(),
  stepType,
  model: "",
  instructions: "",
  input: "",
  outputCFId: "",
  aiToolIds: [],
  rememberConversation: true,
  temperature: 0.4,
  maxOutputTokens: 250,
})
