import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const aiExtractDataModels = {
  openai: {
    models: [
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
      "chatgpt-image-latest",
    ],
    default: "gpt-4o-mini",
  },
  gemini: {
    models: [
      "gemini-3-flash",
      "gemini-3.1-pro-preview",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
    ],
    default: "gemini-2.5-flash",
  },
  claude: {
    models: [
      "claude-opus-4.6",
      "claude-4.5-haiku-20251001",
      "claude-sonnet-4.5-20250929",
      "claude-opus-4.5-20251101",
      "claude-3-5-haiku-20241022",
    ],
    default: "claude-4.5-haiku-20251001",
  },
} as const

export const aiExtractDataSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.aiExtractData),
  inputType: z.enum(["text", "image", "file"]),
  inputFieldId: z.string().trim().min(1),
  provider: z.enum(["openai", "gemini", "claude"]),
  model: z.string().trim().min(1),
  extractFields: z.array(
    z.object({
      key: z.string().trim().min(1),
      customFieldId: z.string().trim().min(1),
    }),
  ),
  file: z
    .object({
      attribute: z.string(),
      value: z.string(),
    })
    .optional(),
})

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
  }
}
