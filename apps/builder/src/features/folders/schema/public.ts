import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { folderResource } from "@/features/folders/schema/resource"
import { createFolderSchema } from "./action"

// Folders are a generic organizing primitive shared across many resource
// types, but this router is gated by the `contacts` token scope — restrict
// the folder types it can touch to the ones contacts-related tooling
// actually owns (tags, custom fields). Other folder types (flow, trigger,
// webhook, sequence, ...) belong to their own scoped routers.
export const contactsFolderTypes = z.enum(["tag", "customField"])
export type ContactsFolderType = z.infer<typeof contactsFolderTypes>

export const listFoldersPublicRequest = z.object({
  folderType: contactsFolderTypes,
  parentId: z.string().optional(),
})
export type ListFoldersPublicRequest = z.infer<typeof listFoldersPublicRequest>

export const listFoldersPublicResponse = z.object({
  data: z.array(folderResource),
})

export const createFolderPublicRequest = z.object({
  name: createFolderSchema.shape.name,
  folderType: contactsFolderTypes,
  parentId: z.string().nullable().optional(),
})
export type CreateFolderPublicRequest = z.infer<
  typeof createFolderPublicRequest
>

export const updateFolderPublicRequest = z.object({
  id: zodBigintAsString(),
  name: createFolderSchema.shape.name,
})
export type UpdateFolderPublicRequest = z.infer<
  typeof updateFolderPublicRequest
>
