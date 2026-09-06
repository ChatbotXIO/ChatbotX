import { folderTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { folderResource } from "@/features/folders/schema/resource"

export const listFoldersPublicRequest = z.object({
  folderType: folderTypes,
  parentId: z.string().optional(),
})
export type ListFoldersPublicRequest = z.infer<typeof listFoldersPublicRequest>

export const listFoldersPublicResponse = z.object({
  data: z.array(folderResource),
})

export const createFolderPublicRequest = z.object({
  name: z.string().trim().min(1).max(255),
  folderType: folderTypes,
  parentId: z.string().nullable().optional(),
})
export type CreateFolderPublicRequest = z.infer<
  typeof createFolderPublicRequest
>

export const updateFolderPublicRequest = z.object({
  id: zodBigintAsString(),
  name: z.string().trim().min(1).max(255),
})
export type UpdateFolderPublicRequest = z.infer<
  typeof updateFolderPublicRequest
>
