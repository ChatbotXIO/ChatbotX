import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

import {
  errorStateDefaultFn,
  errorStateSchema,
  successStateDefaultFn,
  successStateSchema,
} from "../states"
import { stepTypes } from "./step-action"

export const aiExtractDataModels = {
  openai: {
    models: [
      "gpt-5.5-pro",
      "gpt-5.5",
      "gpt-5.4-pro",
      "gpt-5.4",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5.2",
      "gpt-5.1",
      "gpt-5-mini",
      "gpt-5",
      "gpt-5-nano",
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4.1",
      "gpt-4o-mini",
      "gpt-4o",
    ],
    default: "gpt-5.4-mini",
  },
  gemini: {
    models: [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3-flash",
      "gemini-3.1-pro-preview",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ],
    default: "gemini-3.5-flash",
  },
  claude: {
    models: [
      "claude-fable-5",
      "claude-opus-4-8",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
    ],
    default: "claude-haiku-4-5-20251001",
  },
  openrouter: {
    models: [
      "openai/gpt-5.5-pro",
      "openai/gpt-5.5",
      "openai/gpt-5.4-pro",
      "openai/gpt-5.4",
      "openai/gpt-5.4-mini",
      "openai/gpt-5.2-pro",
      "openai/gpt-5.2",
      "openai/gpt-5.1",
      "openai/gpt-5",
      "openai/gpt-4.1",
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-fable-5",
      "anthropic/claude-opus-4.8",
      "anthropic/claude-opus-4.6",
      "anthropic/claude-sonnet-4.6",
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-haiku-4.5",
      "google/gemini-3.5-flash",
      "google/gemini-3.1-pro-preview",
      "google/gemini-3.1-flash-lite",
      "google/gemini-2.5-flash",
      "google/gemini-2.5-flash-lite",
      "google/gemini-2.5-pro",
    ],
    default: "openai/gpt-5.4-mini",
  },
} as const

const extractFieldSchema = z.object({
  key: z.string().trim().min(1),
  customFieldId: z.string().trim().min(1),
  description: z.string().trim().optional(),
})

const extractDataBase = {
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiExtractData),
  provider: z.enum(["openai", "gemini", "claude", "openrouter"]),
  model: z.string().trim().min(1),
  extractFields: z.array(extractFieldSchema),
  states: z.tuple([successStateSchema, errorStateSchema]).optional(),
}

export const aiExtractDataSchema = z.discriminatedUnion("inputType", [
  z.object({
    ...extractDataBase,
    inputType: z.literal("text"),
    inputFieldId: z.string().trim().min(1),
    file: z
      .object({
        attribute: z.string(),
        value: z.string(),
      })
      .optional(),
  }),
  z.object({
    ...extractDataBase,
    inputType: z.literal("image"),
    inputFieldId: z.string().trim().min(1),
  }),
  z.object({
    ...extractDataBase,
    inputType: z.literal("file"),
    inputFieldId: z.string().trim().min(1),
  }),
])

export type AIExtractDataSchema = z.infer<typeof aiExtractDataSchema>

export const aiExtractDataDefaultFn = (
  props: Partial<AIExtractDataSchema> = {},
): AIExtractDataSchema => {
  const provider = props.provider ?? "openai"
  const model = props.model ?? aiExtractDataModels[provider].default

  return {
    id: createId(),
    inputType: "text",
    inputFieldId: "",
    provider,
    model,
    extractFields: [],
    ...props,
    stepType: stepTypes.enum.aiExtractData,
    states: [successStateDefaultFn(), errorStateDefaultFn()],
  }
}
