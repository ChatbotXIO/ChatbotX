import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const aiDeleteMessageHistoryProvider = z.enum([
  "openai",
  "gemini",
  "claude",
  "deepseek",
  "openrouter",
  "openaiCompatible",
])
export type AIDeleteMessageHistoryProvider = z.infer<
  typeof aiDeleteMessageHistoryProvider
>

export const aiDeleteMessageHistorySchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiDeleteMessageHistory),
  provider: aiDeleteMessageHistoryProvider.catch("openai"),
  states: z.tuple([successStateSchema, errorStateSchema]).optional(),
})

export type AIDeleteMessageHistorySchema = z.infer<
  typeof aiDeleteMessageHistorySchema
>

export const aiDeleteMessageHistoryDefaultFn = (
  props: Partial<AIDeleteMessageHistorySchema> = {},
): AIDeleteMessageHistorySchema => ({
  id: createId(),
  provider: props.provider ?? "openai",
  ...props,
  stepType: stepTypes.enum.aiDeleteMessageHistory,
  states: [successStateDefaultFn(), errorStateDefaultFn()],
})
