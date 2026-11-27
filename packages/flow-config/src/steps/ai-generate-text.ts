import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { zodFieldReference } from "../field-reference"
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
  deepseek: "deepseek-flash",
  openrouter: "openai/gpt-5.4-mini",
  muse: "muse-spark-1.3",
} as const

/**
 * Highest temperature Muse answers reliably: at 2 every Muse model either
 * reasons until the budget is gone (empty reply) or returns a 500.
 */
export const MUSE_MAX_TEMPERATURE = 1

/**
 * Extra `max_tokens` the Muse provider adds for reasoning, which Muse counts
 * against `max_tokens`. Without it Spark returns empty replies at small
 * budgets even at `minimal` effort (agent at 100 tokens, the 128-token handoff
 * classifier). `maxOutputTokens` is therefore the visible-text budget for
 * Muse; the reasoning tokens are billed as output.
 */
export const MUSE_REASONING_HEADROOM_TOKENS = 1024

export const MUSE_MAX_OUTPUT_TOKENS_DESCRIPTION = `Maximum tokens of reply text. Muse models may use up to ${MUSE_REASONING_HEADROOM_TOKENS} extra reasoning tokens on top, billed as output.`

export const aiGenerateTextNativeProviderSchema = z.enum([
  "openai",
  "gemini",
  "claude",
  "deepseek",
  "openrouter",
  "muse",
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
    id: zodBigintAsString().describe(
      "Step id (numeric string), unique within the flow.",
    ),
    stepType: z
      .literal(stepTypes.enum.aiGenerateText)
      .describe('Step type discriminator: "aiGenerateText".'),
    provider: aiGenerateTextProviderSchema,
    integrationId: z.string().trim().optional(),
    model: z.string().trim(),
    system: z.string().trim().optional(),
    text: z.string().trim().min(1),
    outputFieldId: zodFieldReference(),
    tools: z.array(z.string()).optional(),
    remember: z.boolean(),
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
    if (value.provider === "muse" && value.temperature > MUSE_MAX_TEMPERATURE) {
      ctx.addIssue({
        code: "custom",
        path: ["temperature"],
        message: `Muse supports temperature up to ${MUSE_MAX_TEMPERATURE}`,
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
