import { z } from "zod"
import { FolderGroup } from "@prisma/client";

export const createFolderSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})

export type CreateFolderSchema = z.infer<typeof createFolderSchema>

export const createFolderBindSchema: [
  chatbotId: z.ZodString,
  group: z.ZodEnum<[FolderGroup]>,
  parentId: z.ZodOptional<z.ZodString>
] = [
  z.string().cuid2(),
  z.enum([FolderGroup.Tag]),
  z.optional(z.string().cuid2()),
]
export type CreateFolderBindSchema = [chatbotId: string, group: FolderGroup, parentId: string | undefined]
