import { z } from "zod"

export const deleteFolderSchema = z.object({})

export type DeleteFolderSchema = z.infer<typeof deleteFolderSchema>

export const deleteFolderBindSchema: [
  chatbotId: z.ZodString,
  folderId: z.ZodString
] = [
  z.string().cuid2(),
  z.string().cuid2()
]

export type DeleteFolderBindSchema = [chatbotId: string, folderId: string]
