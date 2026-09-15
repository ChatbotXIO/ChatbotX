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
  folderType: contactsFolderTypes.describe(
    "Folder category to list, `tag` or `customField`.",
  ),
  parentId: z
    .string()
    .optional()
    .describe(
      "Restrict to sub-folders of this parent. Omit for top-level folders.",
    ),
})

export const listFoldersPublicResponse = z.object({
  data: z.array(folderResource),
})

export const createFolderPublicRequest = z.object({
  name: createFolderSchema.shape.name.describe("Folder name."),
  folderType: contactsFolderTypes.describe(
    "Folder category, `tag` or `customField`.",
  ),
  parentId: z
    .string()
    .nullable()
    .optional()
    .describe("Parent folder id, or null/omit for a top-level folder."),
})
export type CreateFolderPublicRequest = z.infer<
  typeof createFolderPublicRequest
>

export const updateFolderPublicRequest = z.object({
  id: zodBigintAsString().describe("Folder id. Get it from `folders.list`."),
  name: createFolderSchema.shape.name.describe("New folder name."),
})
export type UpdateFolderPublicRequest = z.infer<
  typeof updateFolderPublicRequest
>
