import { z } from "zod"

export const duplicateAiAgentBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type DuplicateAiAgentBindSchema = [chatbotId: string, ids: string]
