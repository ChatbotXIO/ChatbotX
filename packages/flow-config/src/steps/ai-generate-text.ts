import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { aiProviders } from "@chatbotx.io/utils/ai"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const defaultAIModels = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-pro",
  claude: "claude-3-5-sonnet-20241022",
  deepseek: "deepseek-chat",
} as const

export const aiGenerateTextSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiGenerateText),
  provider: aiProviders,
  model: z.string().trim().min(1),
  system: z.string().trim().optional(),
  text: z.string().trim().min(1),
  outputFieldId: z.string().trim().min(1),
  tools: z.array(z.string()).optional(),
  remember: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(250).max(4096),
})

export type AIGenerateTextSchema = z.infer<typeof aiGenerateTextSchema>

export const aiGenerateTextDefaultFn = (
  props: Partial<AIGenerateTextSchema> = {},
): AIGenerateTextSchema => {
  let model: string = defaultAIModels.openai
  if (props.provider && !props.model) {
    model = defaultAIModels[props.provider as keyof typeof defaultAIModels]
  }

  return {
    id: createId(),
    provider: aiProviders.enum.openai,
    model,
    system: "",
    text: "",
    outputFieldId: "",
    tools: [],
    remember: false,
    temperature: 1.0,
    maxOutputTokens: 250,
    ...props,
    stepType: stepTypes.enum.aiGenerateText,
  }
}
