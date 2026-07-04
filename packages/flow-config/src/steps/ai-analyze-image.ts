import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const aiAnalyzeImageProvider = z.enum([
  "openai",
  "gemini",
  "claude",
  "openrouter",
])
export type AIAnalyzeImageProvider = z.infer<typeof aiAnalyzeImageProvider>
export const aiAnalyzeImageProviderSchema = z.enum([
  ...aiAnalyzeImageProvider.options,
  "openaiCompatible",
])

export const defaultAnalyzeModels = {
  openai: "gpt-5.4-mini",
  gemini: "gemini-3.5-flash",
  claude: "claude-haiku-4-5-20251001",
  openrouter: "openai/gpt-5.4-mini",
} as const

export const aiAnalyzeImageSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.aiAnalyzeImage),
    provider: aiAnalyzeImageProviderSchema,
    integrationId: z.string().trim().optional(),
    model: z.string().trim(),
    prompt: z.string().trim().min(1),
    inputFieldId: z.string().trim().min(1),
    outputFieldId: z.string().trim().min(1),
    temperature: z.number().min(0).max(2),
    maxOutputTokens: z.number().int().min(250).max(4096),
    states: z.tuple([successStateSchema, errorStateSchema]).optional(),
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

export type AIAnalyzeImageSchema = z.infer<typeof aiAnalyzeImageSchema>

export const AIAnalyzeImageDefaultFn = (
  props: Partial<AIAnalyzeImageSchema> = {},
): AIAnalyzeImageSchema => {
  const provider = props.provider ?? "openai"
  const model: string =
    props.model ??
    (provider === "openaiCompatible"
      ? ""
      : defaultAnalyzeModels[provider as keyof typeof defaultAnalyzeModels])

  return {
    id: createId(),
    provider,
    ...(provider === "openaiCompatible"
      ? { integrationId: "integrationId" in props ? props.integrationId : "" }
      : {}),
    model,
    prompt: "",
    inputFieldId: "",
    outputFieldId: "",
    temperature: 1.0,
    maxOutputTokens: 1000,
    ...props,
    stepType: stepTypes.enum.aiAnalyzeImage,
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  }
}
