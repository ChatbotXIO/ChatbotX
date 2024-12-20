import { z } from "zod"
import { FolderGroup } from "@prisma/client";

export const createFolderSchema = z.object({
  chatbotId: z.string().cuid2(),
  name: z.string().min(1).max(255).trim(),
  parentId: z.optional(z.string().cuid2()),
  group: z.enum([FolderGroup.TAG])
})

export type CreateFolderSchema = z.infer<typeof createFolderSchema>
