import { z } from "zod"

export const deleteTagBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<Zod.ZodString>,
] = [z.string().cuid2(), z.array(z.string().cuid2())]

export type DeleteTagBindSchema = [chatbotId: string, ids: string[]]
