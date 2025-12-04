import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../../../steps/step-action"
import {
  baseGenerateTextDefaultValues,
  baseGenerateTextFieldsSchema,
} from "./shared/generate-text"

export const AIGenerateTextProvider = {
  OPENAI: "openai",
  GEMINI: "gemini",
  CLAUDE: "claude",
  DEEPSEEK: "deepseek",
} as const

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
  ...baseGenerateTextFieldsSchema,
  aiTriggerIds: z.array(z.cuid2()),
})

export type AIGenerateTextSchema = z.infer<typeof aiGenerateTextSchema>

export const aiGenerateTextDefaultFn = (
  provider: "openai" | "gemini" | "claude" | "deepseek" = "openai",
): AIGenerateTextSchema => {
  const defaultModels = {
    openai: "gpt-4o-mini",
    gemini: "gemini-2.5-pro",
    claude: "claude-3-5-sonnet-20241022",
    deepseek: "deepseek-chat",
  }

  return {
    id: createId(),
    stepType: StepType.aiGenerateText,
    provider,
    model: defaultModels[provider],
    ...baseGenerateTextDefaultValues,
    aiTriggerIds: [],
  }
}
