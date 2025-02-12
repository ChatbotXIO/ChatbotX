import { z } from "zod"

export const deleteAITriggerBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<z.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAITriggerBindSchema = [chatbotId: string, ids: string[]]
