import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const aiProviders = {
  openai: "openai",
  gemini: "gemini",
  claude: "claude",
  deepseek: "deepseek",
} as const
export type AIProvider = keyof typeof aiProviders

export const defaultAIModelIds = {
  openai: "openai/gpt-4o-mini",
  gemini: "gemini/gemini-2.5-pro",
  claude: "claude/claude-3-5-sonnet-20241022",
  deepseek: "deepseek/deepseek-chat",
} as const

export const aiGenerateTextSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.aiGenerateText),
  provider: z.enum(aiProviders),
  model: z.string().trim().min(1),
  system: z.string().trim().optional(),
  text: z.string().trim().min(1),
  outputCfId: z.string().trim().min(1),
  tools: z.array(z.string()).optional(),
  remember: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(250).max(4096),
})

export type AIGenerateTextSchema = z.infer<typeof aiGenerateTextSchema>

export const aiGenerateTextDefaultFn = (
  props: Partial<AIGenerateTextSchema> = {},
): AIGenerateTextSchema => {
  let model: string = defaultAIModelIds.openai
  if (props.provider && !props.model) {
    model = defaultAIModelIds[props.provider as AIProvider]
  }

  return {
    id: createId(),
    provider: aiProviders.openai,
    model,
    system: "",
    text: "",
    outputCfId: "",
    tools: [],
    remember: false,
    temperature: 1.0,
    maxOutputTokens: 250,
    ...props,
    stepType: StepType.aiGenerateText,
  }
}
