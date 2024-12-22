import { z } from "zod"

export const editFolderSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})

export type EditFolderSchema = z.infer<typeof editFolderSchema>

export const editFolderBindSchema: [
  chatbotId: z.ZodString,
  folderId: z.ZodString
] = [
  z.string().cuid2(),
  z.string().cuid2()
]

export type EditFolderBindSchema = [chatbotId: string, folderId: string]
