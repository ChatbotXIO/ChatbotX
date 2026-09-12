import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { mediaLibraryFileResource, mediaLibraryFolderResource } from "."

export const mediaLibraryFolderPublicResource = mediaLibraryFolderResource.omit(
  { workspaceId: true },
)

export const mediaLibraryFolderListItemPublicResource =
  mediaLibraryFolderPublicResource.extend({ fileCount: z.number() })

export const listMediaLibraryFoldersPublicRequest = publicListRequest

export const listMediaLibraryFoldersPublicResponse = publicListResponse(
  mediaLibraryFolderListItemPublicResource,
)

export const mediaLibraryFilePublicResource = mediaLibraryFileResource.omit({
  workspaceId: true,
})

export const mediaLibraryFileListItemPublicResource =
  mediaLibraryFilePublicResource.extend({ url: z.string() })

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

export const listMediaLibraryFilesPublicRequest = publicListRequest.extend({
  folderId: zodBigintAsString().nullish(),
  search: z.string().optional(),
  filter: z
    .enum(["all", "recent", "favourite"])
    .optional()
    .describe(
      "`all` and `recent` span every folder (differing only in sort); `favourite` spans every folder and ignores `folderId`. Omit both `filter` and `folderId` to list root-level files only.",
    ),
})

export const listMediaLibraryFilesPublicResponse = publicListResponse(
  mediaLibraryFileListItemPublicResource,
)

export const createMediaLibraryUploadUrlPublicRequest = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
})

export const createMediaLibraryUploadUrlPublicResponse = z.object({
  path: z.string(),
  uploadUrl: z.string(),
  publicUrl: z.string(),
})

export const getMediaLibraryFilePublicRequest = z.object({
  fileId: zodBigintAsString(),
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

export const setMediaLibraryFavouritePublicRequest = z.object({
  fileId: zodBigintAsString(),
  isFavourite: z.boolean(),
})

export const recordMediaLibraryFileAccessPublicRequest = z.object({
  fileId: zodBigintAsString(),
})

export const moveMediaLibraryFilesPublicRequest = z.object({
  fileIds: z.array(zodBigintAsString()).min(1),
  folderId: zodBigintAsString().nullish(),
})
