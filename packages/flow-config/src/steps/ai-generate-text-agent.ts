import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const aiGenerateTextAgentProvider = z.enum([
  "openai",
  "gemini",
  "claude",
  "deepseek",
  "openrouter",
  "openaiCompatible",
])
export type AIGenerateTextAgentProvider = z.infer<
  typeof aiGenerateTextAgentProvider
>

export const aiGenerateTextAgentSchema = z
  .object({
    id: zodBigintAsString(),
    stepType: z.literal(stepTypes.enum.aiGenerateTextAgent),
    provider: aiGenerateTextAgentProvider.catch("openai"),
    integrationId: z.string().trim().optional(),
    model: z.string().trim().optional(),
    aiAgentId: zodBigintAsString(),
    message: z.string().trim().min(1),
    outputFieldId: z.string().trim().min(1),
    rememberConversation: z.boolean(),
    states: z.tuple([successStateSchema, errorStateSchema]).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.provider !== "openaiCompatible") {
      return
    }

    if (!value.integrationId?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["integrationId"],
        message: "Integration is required",
      })
    }

    if (!value.model?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["model"],
        message: "Model is required",
      })
    }
  })

export type AIGenerateTextAgentSchema = z.infer<
  typeof aiGenerateTextAgentSchema
>

export const aiGenerateTextAgentDefaultFn = (
  props: Partial<AIGenerateTextAgentSchema> = {},
): AIGenerateTextAgentSchema => {
  const provider = props.provider ?? "openai"

  return {
    id: createId(),
    provider,
    ...(provider === "openaiCompatible"
      ? {
          integrationId: "integrationId" in props ? props.integrationId : "",
          model: "model" in props ? props.model : "",
        }
      : {}),
    aiAgentId: "",
    message: "",
    outputFieldId: "",
    rememberConversation: true,
    ...props,
    stepType: stepTypes.enum.aiGenerateTextAgent,
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  }
}
