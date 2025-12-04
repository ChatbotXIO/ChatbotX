import { z } from "zod"

export const baseGenerateTextFieldsSchema = {
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  outputCfId: z.cuid2().optional(),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.boolean().default(true),
  temperature: z.number().min(0).max(2).default(1.0),
  maxTokens: z.number().int().min(250).max(4096).default(250),
} as const

export const baseGenerateTextDefaultValues = {
  prompt: "",
  userMessage: "",
  outputCfId: undefined,
  tools: [] as string[],
  rememberConversation: true,
  temperature: 1.0,
  maxTokens: 250,
}
