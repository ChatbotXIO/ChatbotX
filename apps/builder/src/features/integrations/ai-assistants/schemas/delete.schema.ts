import { z } from "zod"

export const deleteAIAssistantsBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<z.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAIAssistantsBindSchema = [chatbotId: string, ids: string[]]
