import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import { stepTypes } from "./step-action"

export const aiAnalyzeImageProvider = z.enum(["openai", "gemini", "claude"])
export type AIAnalyzeImageProvider = z.infer<typeof aiAnalyzeImageProvider>

export const defaultAnalyzeModels = {
  openai: "gpt-5.4-mini",
  gemini: "gemini-2.5-flash",
  claude: "claude-4.5-haiku-20251001",
} as const

export const aiAnalyzeImageSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiAnalyzeImage),
  provider: aiAnalyzeImageProvider,
  model: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  inputFieldId: z.string().trim().min(1),
  outputFieldId: z.string().trim().min(1),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(250).max(4096),
})

export type AIAnalyzeImageSchema = z.infer<typeof aiAnalyzeImageSchema>

export const AIAnalyzeImageDefaultFn = (
  props: Partial<AIAnalyzeImageSchema> = {},
): AIAnalyzeImageSchema => {
  const provider = props.provider ?? "openai"
  const model: string =
    props.model ??
    defaultAnalyzeModels[provider as keyof typeof defaultAnalyzeModels]

  return {
    id: createId(),
    provider,
    model,
    prompt: "",
    inputFieldId: "",
    outputFieldId: "",
    temperature: 1.0,
    maxOutputTokens: 1000,
    ...props,
    stepType: stepTypes.enum.aiAnalyzeImage,
  }
}
