import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import { stepTypes } from "./step-action"

export const aiGenerateTextAgentProvider = z.enum([
  "openai",
  "gemini",
  "claude",
  "deepseek",
])
export type AIGenerateTextAgentProvider = z.infer<
  typeof aiGenerateTextAgentProvider
>

export const aiGenerateTextAgentSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiGenerateTextAgent),
  provider: aiGenerateTextAgentProvider.catch("openai"),
  aiAgentId: zodBigintAsString(),
  message: z.string().trim().min(1),
  outputFieldId: z.string().trim().min(1),
  rememberConversation: z.boolean(),
})

export type AIGenerateTextAgentSchema = z.infer<
  typeof aiGenerateTextAgentSchema
>

export const aiGenerateTextAgentDefaultFn = (
  props: Partial<AIGenerateTextAgentSchema> = {},
): AIGenerateTextAgentSchema => {
  const provider = props.provider ?? "openai"

  return {
    id: createId(),
    provider,
    aiAgentId: "",
    message: "",
    outputFieldId: "",
    rememberConversation: true,
    ...props,
    stepType: stepTypes.enum.aiGenerateTextAgent,
  }
}
