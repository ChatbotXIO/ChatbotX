import { z } from "zod"

export const deleteFlowBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<Zod.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteFlowBindSchema = [chatbotId: string, ids: string[]]
