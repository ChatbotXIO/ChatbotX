import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const AIGenerateTextAgentSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.aiGenerateTextAgent),
  aiAgentId: z.bigint(),
  message: z.string().trim().min(1),
  outputCfId: z.bigint(),
  aiToolIds: z.array(z.bigint()),
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
