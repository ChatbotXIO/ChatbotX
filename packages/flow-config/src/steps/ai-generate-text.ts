import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const defaultAIModels = {
  openai: "gpt-5.4-mini",
  gemini: "gemini-3.5-flash",
  claude: "claude-sonnet-4-6",
  deepseek: "deepseek-v4-flash",
  openrouter: "openai/gpt-5.4-mini",
} as const

export const aiGenerateTextNativeProviderSchema = z.enum([
  "openai",
  "gemini",
  "claude",
  "deepseek",
  "openrouter",
])
export type AIGenerateTextNativeProvider = z.infer<
  typeof aiGenerateTextNativeProviderSchema
>

export const aiGenerateTextProviderSchema = z.enum([
  ...aiGenerateTextNativeProviderSchema.options,
  "openaiCompatible",
])

export const aiGenerateTextSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.aiGenerateText),
    provider: aiGenerateTextProviderSchema,
    integrationId: z.string().trim().optional(),
    model: z.string().trim(),
    system: z.string().trim().optional(),
    text: z.string().trim().min(1),
    outputFieldId: z.string().trim().min(1),
    tools: z.array(z.string()).optional(),
    remember: z.boolean(),
    temperature: z.number().min(0).max(2),
    maxOutputTokens: z.number().int().min(250).max(4096),
    states: z.tuple([successStateSchema, errorStateSchema]),
  })
  .superRefine((value, ctx) => {
    if (!value.model.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["model"],
        message: "Model is required",
      })
    }
    if (value.provider === "openaiCompatible" && !value.integrationId?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["integrationId"],
        message: "Integration is required",
      })
    }
  })

export type AIGenerateTextSchema = z.infer<typeof aiGenerateTextSchema>

export const aiGenerateTextDefaultFn = (
  props: Partial<AIGenerateTextSchema> = {},
): AIGenerateTextSchema => {
  const provider = props.provider ?? "openai"

  const model: string =
    props.model ??
    (provider === "openaiCompatible"
      ? ""
      : defaultAIModels[provider as keyof typeof defaultAIModels])

  return {
    id: createId(),
    provider,
    ...(provider === "openaiCompatible"
      ? { integrationId: "integrationId" in props ? props.integrationId : "" }
      : {}),
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
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  }
}
