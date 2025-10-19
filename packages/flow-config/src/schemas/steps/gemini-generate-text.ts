import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const GeminiModel = {
  Gemini25Pro: "gemini-2.5-pro",
  Gemini25Flash: "gemini-2.5-flash",
} as const

export const geminiSchema = z.object({
  id: z.cuid2(),
  model: z.enum(GeminiModel),
})

export const geminiGenerateTextSchema = geminiSchema.extend({
  stepType: z.literal(StepType.GEMINI_GENERATE_TEXT),
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  resultCustomFieldId: z.union([z.cuid2(), z.literal("")]).optional(),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(250).max(4096),
})

export type GeminiGenerateTextSchema = z.infer<typeof geminiGenerateTextSchema>

export const geminiGenerateTextDefaultFn = (): GeminiGenerateTextSchema => ({
  id: createId(),
  stepType: StepType.GEMINI_GENERATE_TEXT,
  model: GeminiModel.Gemini25Pro,
  prompt: "",
  userMessage: "",
  resultCustomFieldId: undefined,
  tools: [],
  rememberConversation: true,
  temperature: 1.0,
  maxTokens: 250,
})
