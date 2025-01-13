import { z } from "zod"

export const deleteLogBindSchema: [
  chatbotId: z.ZodString,
  ids: z.ZodArray<Zod.ZodString>,
  logType: z.ZodString,
] = [z.string().cuid2(), z.array(z.string().cuid2()), z.string()]

export type DeleteLogBindSchema = [
  chatbotId: string,
  ids: string[],
  logType: string,
]
