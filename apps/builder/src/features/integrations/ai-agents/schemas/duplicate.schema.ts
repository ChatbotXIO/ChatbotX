import { z } from "zod"

export const duplicateAiAgentBindSchema: [
  chatbotId: z.ZodString,
  id: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type DuplicateAiAgentBindSchema = [chatbotId: string, id: string]
