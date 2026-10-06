import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { createFolderSchema } from "@/features/folders/schema/action"
import { folderResource } from "@/features/folders/schema/resource"

export const sequenceFolderResource = folderResource.omit({ workspaceId: true })

export const sequenceFolderIdParam = z.object({
  id: zodBigintAsString().describe(
    "Sequence folder id. Get it from `sequences.listFolders`.",
  ),
})

export const listSequenceFoldersPublicRequest = z.object({
  parentId: zodBigintAsString()
    .optional()
    .describe(
      "Restrict to sub-folders of this parent. Omit for top-level folders.",
    ),
  isTrash: z
    .boolean()
    .optional()
    .describe(
      "true for trash folders only, false to leave them out. Omit for both.",
    ),
})

export const createSequenceFolderPublicRequest = z.object({
  name: createFolderSchema.shape.name.describe("Folder name."),
  parentId: zodBigintAsString()
    .nullable()
    .optional()
    .describe("Parent folder id, or null/omit for a top-level folder."),
})

export const updateSequenceFolderPublicRequest = sequenceFolderIdParam.extend({
  name: createFolderSchema.shape.name.describe("New folder name."),
})
