import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import { zodFieldReference } from "../field-reference"
import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import {
  MUSE_MAX_OUTPUT_TOKENS_DESCRIPTION,
  MUSE_MAX_TEMPERATURE,
} from "./ai-generate-text"
import { stepTypes } from "./step-action"

export const aiAnalyzeImageProvider = z.enum([
  "openai",
  "gemini",
  "claude",
  "openrouter",
  "muse",
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
  muse: "muse-spark-1.3",
} as const

export const aiAnalyzeImageSchema = z
  .object({
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.aiAnalyzeImage)
      .describe('Step type discriminator: "aiAnalyzeImage".'),
    provider: aiAnalyzeImageProviderSchema,
    integrationId: z.string().trim().optional(),
    model: z.string().trim(),
    prompt: z.string().trim().min(1),
    inputFieldId: z.string().trim().min(1),
    outputFieldId: zodFieldReference(),
    temperature: z
      .number()
      .min(0)
      .max(2)
      .describe(`Sampling temperature, 0-2 (Muse: 0-${MUSE_MAX_TEMPERATURE}).`),
    maxOutputTokens: z
      .number()
      .int()
      .min(250)
      .max(4096)
      .describe(MUSE_MAX_OUTPUT_TOKENS_DESCRIPTION),
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
    if (value.provider === "muse" && value.temperature > MUSE_MAX_TEMPERATURE) {
      ctx.addIssue({
        code: "custom",
        path: ["temperature"],
        message: `Muse supports temperature up to ${MUSE_MAX_TEMPERATURE}`,
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
