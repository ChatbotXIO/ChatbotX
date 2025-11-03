import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const AIGenerateTextSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.aiGenerateText),
  model: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  message: z.string().trim().min(1),
  outputCfId: z.cuid2(),
  aiToolIds: z.array(z.cuid2()),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().optional(),
})
export type AIGenerateTextSchema = z.infer<typeof AIGenerateTextSchema>

export const AIGenerateTextDefaultFn = (
  props?: Partial<AIGenerateTextSchema>,
): AIGenerateTextSchema => ({
  id: createId(),
  stepType: StepType.aiGenerateText,
  model: "",
  prompt: "",
  message: "",
  outputCfId: "",
  aiToolIds: [],
  rememberConversation: false,
  temperature: 0.4,
  maxOutputTokens: 250,
  ...props,
})
