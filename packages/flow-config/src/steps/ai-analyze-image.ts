import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const aiAnalyzeImageProviders = {
  openai: "openai",
  gemini: "gemini",
  claude: "claude",
} as const

export type AIAnalyzeImageProvider = keyof typeof aiAnalyzeImageProviders

export const defaultAIAnalyzeImageModelIds = {
  openai: "openai/gpt-4o",
  gemini: "gemini/gemini-1.5-pro",
  claude: "claude/claude-3-5-sonnet-20241022",
} as const

export const aiAnalyzeImageSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.aiAnalyzeImage),
  provider: z.nativeEnum(aiAnalyzeImageProviders),
  model: z.string().trim().min(1),
  prompt: z.string().trim().optional(),
  imageUrl: z.string().trim().min(1), // URL or variable
  outputCfId: z.string().trim().min(1),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(250).max(4096),
})

export type AIAnalyzeImageSchema = z.infer<typeof aiAnalyzeImageSchema>

export const AIAnalyzeImageDefaultFn = (
  props: Partial<AIAnalyzeImageSchema> = {},
): AIAnalyzeImageSchema => {
  let model: string = defaultAIAnalyzeImageModelIds.openai
  if (props.provider && !props.model) {
    model =
      defaultAIAnalyzeImageModelIds[props.provider as AIAnalyzeImageProvider]
  }

  return {
    id: createId(),
    stepType: StepType.aiAnalyzeImage,
    provider: aiAnalyzeImageProviders.openai,
    model,
    prompt: "What's in this image?",
    imageUrl: "",
    outputCfId: "",
    temperature: 1.0,
    maxOutputTokens: 1000,
    ...props,
  }
}
