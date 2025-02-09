import { z } from "zod"

export const duplicateAiTriggerBindSchema: [
  chatbotId: z.ZodString,
  id: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type DuplicateAiTriggerBindSchema = [chatbotId: string, id: string]
