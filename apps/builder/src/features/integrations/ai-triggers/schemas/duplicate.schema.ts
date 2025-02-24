import { z } from "zod"

export const duplicateAITriggerBindSchema: [
  chatbotId: z.ZodString,
  id: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type DuplicateAITriggerBindSchema = [chatbotId: string, id: string]
