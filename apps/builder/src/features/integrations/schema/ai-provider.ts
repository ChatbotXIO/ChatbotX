import { z } from "zod"

export const aiProviderPathParam = z.enum([
  "claude",
  "deepseek",
  "gemini",
  "openai",
])
export type AiProviderPathParam = z.infer<typeof aiProviderPathParam>

export const getAiProviderRequest = z.object({
  provider: aiProviderPathParam.describe("AI provider identifier."),
})

// Never includes `auth` — the encrypted/secret credential. Only `hasApiKey`
// (a boolean) signals whether a key is configured; the raw secret must never
// reach a public API response.
export const publicAiProviderResource = z.object({
  id: z.string(),
  model: z.string(),
  temperature: z.number().nullable(),
  maxOutputTokens: z.number(),
  autoReply: z.boolean(),
  hasApiKey: z.boolean(),
})

export const connectAiProviderRequest = z.object({
  apiKey: z.string().min(1).describe("Provider API key."),
  model: z
    .string()
    .min(1)
    .describe("Model identifier to use for this provider."),
  temperature: z.coerce
    .number()
    .min(0)
    .max(2)
    .describe("Sampling temperature."),
  maxOutputTokens: z.coerce
    .number()
    .int()
    .min(1)
    .max(8192)
    .describe("Maximum tokens generated per response."),
})
