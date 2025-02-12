import { z } from "zod"

export const duplicateAIAgentBindSchema: [
  chatbotId: z.ZodString,
  id: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type DuplicateAIAgentBindSchema = [chatbotId: string, id: string]
