import { z } from "zod"

export const deleteAiAssistantsBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<z.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAiAssistantsBindSchema = [chatbotId: string, ids: string[]]
