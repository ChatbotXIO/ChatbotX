import { z } from "zod"

/**
 * Base schema chứa các field chung cho tất cả các generate text schemas
 */
export const baseGenerateTextFieldsSchema = {
  prompt: z.string().optional(),
  userMessage: z.string().optional(),
  resultCustomFieldId: z.union([z.cuid2(), z.literal("")]).optional(),
  tools: z.array(z.string()).optional(),
  rememberConversation: z.boolean().default(true),
  temperature: z.number().min(0).max(2).default(1.0),
  maxTokens: z.number().int().min(250).max(4096).default(250),
} as const

/**
 * Default values chung cho các generate text schemas
 */
export const baseGenerateTextDefaultValues = {
  prompt: "",
  userMessage: "",
  resultCustomFieldId: undefined,
  tools: [] as string[],
  rememberConversation: true,
  temperature: 1.0,
  maxTokens: 250,
}

