import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { mediaLibraryFileResource, mediaLibraryFolderResource } from "../schema"

export const mediaLibraryFolderPublicResource = mediaLibraryFolderResource.omit(
  { workspaceId: true },
)

export const mediaLibraryFolderListItemPublicResource =
  mediaLibraryFolderPublicResource.extend({ fileCount: z.number() })

export const listMediaLibraryFoldersPublicResponse = z.object({
  data: z.array(mediaLibraryFolderListItemPublicResource),
})

export const mediaLibraryFilePublicResource = mediaLibraryFileResource.omit({
  workspaceId: true,
})

export const mediaLibraryFileListItemPublicResource =
  mediaLibraryFilePublicResource.extend({ url: z.string() })

export const listMediaLibraryFilesPublicResponse = z.object({
  data: z.array(mediaLibraryFileListItemPublicResource),
})

export const listMediaLibraryFoldersPublicRequest = z.object({})

export const createMediaLibraryFolderPublicRequest = z.object({
  name: z.string().min(1),
})

export const renameMediaLibraryFolderPublicRequest = z.object({
  folderId: zodBigintAsString(),
  name: z.string().min(1),
})

export const deleteMediaLibraryFolderPublicRequest = z.object({
  folderId: zodBigintAsString(),
})

export const listMediaLibraryFilesPublicRequest = z.object({
  folderId: zodBigintAsString().nullish(),
  search: z.string().optional(),
  filter: z.enum(["recent", "favourite"]).optional(),
  page: z.number().int().min(1).optional(),
})

export const createMediaLibraryFilePublicRequest = z.object({
  folderId: zodBigintAsString().nullish(),
  name: z.string(),
  path: z.string(),
  mimeType: z.string(),
  size: z.number(),
})

export const deleteMediaLibraryFilePublicRequest = z.object({
  fileId: zodBigintAsString(),
})

export const toggleMediaLibraryFavouritePublicRequest = z.object({
  fileId: zodBigintAsString(),
})

export const moveMediaLibraryFilesPublicRequest = z.object({
  fileIds: z.array(zodBigintAsString()).min(1),
  folderId: zodBigintAsString().nullish(),
})
