import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const AIGenerateTextAgentSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiGenerateTextAgent),
  aiAgentId: zodBigintAsString(),
  message: z.string().trim().min(1),
  outputCfId: zodBigintAsString(),
  aiToolIds: z.array(zodBigintAsString()),
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
  stepType: stepTypes.enum.aiGenerateTextAgent,
  aiAgentId: "",
  message: "",
  outputCfId: "",
  aiToolIds: [],
  rememberConversation: true,
  temperature: 0.4,
  maxOutputTokens: 250,
  ...props,
})
