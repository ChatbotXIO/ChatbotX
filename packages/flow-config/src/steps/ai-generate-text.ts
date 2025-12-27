import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const AIGenerateTextProvider = {
  OPENAI: "openai",
  GEMINI: "gemini",
  CLAUDE: "claude",
  DEEPSEEK: "deepseek",
} as const

export const AI_PROVIDERS = AIGenerateTextProvider

export type AIGenerateTextProviderType =
  (typeof AIGenerateTextProvider)[keyof typeof AIGenerateTextProvider]

export type AIProvider = AIGenerateTextProviderType

export const DEFAULT_AI_MODEL_IDS = {
  openai: "gpt-4o-mini" as const,
  gemini: "gemini-2.5-pro" as const,
  claude: "claude-3-5-sonnet-20241022" as const,
  deepseek: "deepseek-chat" as const,
} as const

export const DEFAULT_AI_MODELS = DEFAULT_AI_MODEL_IDS

export const aiGenerateTextSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.aiGenerateText),
  provider: z.enum([
    AIGenerateTextProvider.OPENAI,
    AIGenerateTextProvider.GEMINI,
    AIGenerateTextProvider.CLAUDE,
    AIGenerateTextProvider.DEEPSEEK,
  ]),
  model: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  userMessage: z.string().trim().min(1),
  outputCfId: z.string().trim().min(1),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(250).max(4096),
  aiTriggerIds: z.array(z.cuid2()),
})

export type AIGenerateTextSchema = z.infer<typeof aiGenerateTextSchema>

export const aiGenerateTextDefaultFn = (
  provider: AIGenerateTextProviderType = AIGenerateTextProvider.OPENAI,
): AIGenerateTextSchema => ({
  id: createId(),
  stepType: StepType.aiGenerateText,
  provider,
  model: DEFAULT_AI_MODELS[provider],
  prompt: "",
  userMessage: "",
  outputCfId: "",
  tools: [],
  rememberConversation: false,
  temperature: 1.0,
  maxTokens: 250,
  aiTriggerIds: [],
})
