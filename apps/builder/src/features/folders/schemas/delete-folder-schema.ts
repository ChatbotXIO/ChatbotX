import { z } from "zod"

export const deleteFolderBindSchema: [
  chatbotId: z.ZodString,
  id: z.ZodString
] = [
    z.string().cuid2(),
    z.string().cuid2()
  ]

export type DeleteFolderBindSchema = [chatbotId: string, id: string]
