import { z } from "zod"

export const deleteAiAgentBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<z.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAiAgentBindSchema = [chatbotId: string, ids: string[]]
