import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const AIGenerateTextAgentSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.aiGenerateTextAgent),
  aiAgentId: z.cuid2(),
  message: z.string().trim().min(1),
  outputCfId: z.cuid2(),
  aiToolIds: z.array(z.cuid2()),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().optional(),
})

export type AIGenerateTextAgentSchema = z.infer<
  typeof AIGenerateTextAgentSchema
>

export const AIGenerateTextAgentDefaultFn = (
  props?: Partial<AIGenerateTextAgentSchema>,
): AIGenerateTextAgentSchema => ({
  id: createId(),
  stepType: StepType.aiGenerateTextAgent,
  aiAgentId: "",
  message: "",
  outputCfId: "",
  aiToolIds: [],
  rememberConversation: true,
  temperature: 0.4,
  maxOutputTokens: 250,
  ...props,
})
