import { z } from "zod"

export const deleteAiTriggerBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<z.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteAiTriggerBindSchema = [chatbotId: string, ids: string[]]
