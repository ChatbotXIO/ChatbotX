import {
  openaiCompatiblePresetConfigs,
  openaiCompatibleProviderPresets,
} from "@chatbotx.io/ai"
import { z } from "zod"

const defaultModelSchema = z.string().trim().min(1).max(255)
const baseURLSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  })

export const connectOpenaiCompatibleSchema = z.object({
  apiKey: z.string().trim().min(1),
  autoReply: z.boolean().default(false),
  baseURL: baseURLSchema,
  defaultModel: defaultModelSchema.optional(),
  enabled: z.boolean().default(true),
  name: z.string().trim().min(1).max(255),
  preset: openaiCompatibleProviderPresets.default("lmstudio"),
})
export type ConnectOpenaiCompatibleSchema = z.infer<
  typeof connectOpenaiCompatibleSchema
>

export const updateOpenaiCompatibleSchema = connectOpenaiCompatibleSchema
  .extend({
    apiKey: z.string().trim().optional(),
  })
  .partial()
export type UpdateOpenaiCompatibleSchema = z.infer<
  typeof updateOpenaiCompatibleSchema
>

export function resolveOpenaiCompatibleDefaultModel(input: {
  preset: z.infer<typeof openaiCompatibleProviderPresets>
  defaultModel?: string
}) {
  return (
    input.defaultModel ??
    openaiCompatiblePresetConfigs[input.preset].defaultModel
  )
}

export const updateOpenaiCompatibleEnabledSchema = z.object({
  autoReply: z.boolean().optional(),
  enabled: z.boolean().optional(),
})
export type UpdateOpenaiCompatibleEnabledSchema = z.infer<
  typeof updateOpenaiCompatibleEnabledSchema
>
