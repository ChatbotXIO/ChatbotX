import { z } from "zod"

export const deleteAIAgentBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<z.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAIAgentBindSchema = [chatbotId: string, ids: string[]]
