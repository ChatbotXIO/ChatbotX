import { z } from "zod"
import { FolderType } from "@ahachat.ai/database";

export const createFolderSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type CreateFolderSchema = z.infer<typeof createFolderSchema>

export const createFolderBindSchema: [
  chatbotId: z.ZodString,
  folderType: z.ZodNativeEnum<typeof FolderType>,
  parentId: z.ZodNullable<z.ZodString>
] = [
    z.string().cuid2(),
    z.nativeEnum(FolderType),
    z.string().cuid2().nullable()
  ]
export type CreateFolderBindSchema = [chatbotId: string, group: FolderType, parentId: string | null]
