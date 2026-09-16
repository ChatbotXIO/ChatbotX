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
  name: z.string().min(1).describe("Folder name."),
})

export const renameMediaLibraryFolderPublicRequest = z.object({
  folderId: zodBigintAsString().describe(
    "Folder id. Get it from `mediaLibrary.listFolders`.",
  ),
  name: z.string().min(1).describe("New folder name."),
})

export const deleteMediaLibraryFolderPublicRequest = z.object({
  folderId: zodBigintAsString().describe(
    "Folder id. Get it from `mediaLibrary.listFolders`.",
  ),
})

export const listMediaLibraryFilesPublicRequest = publicListRequest.extend({
  folderId: zodBigintAsString()
    .nullish()
    .describe(
      "Restrict to files in this folder. Omit for root-level files only.",
    ),
  search: z
    .string()
    .optional()
    .describe("Case-insensitive substring match against the file name."),
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
  fileName: z.string().min(1).describe("File name for the upload."),
  mimeType: z.string().min(1).describe("File MIME type."),
})

export const createMediaLibraryUploadUrlPublicResponse = z.object({
  path: z.string(),
  uploadUrl: z.string(),
  publicUrl: z.string(),
})

export const getMediaLibraryFilePublicRequest = z.object({
  fileId: zodBigintAsString().describe(
    "File id. Get it from `mediaLibrary.listFiles`.",
  ),
})

export const createMediaLibraryFilePublicRequest = z.object({
  folderId: zodBigintAsString()
    .nullish()
    .describe("Folder to register the file in, or null for root-level."),
  name: z.string().describe("File name."),
  path: z
    .string()
    .describe("Storage path from `mediaLibrary.createUploadUrl`."),
  mimeType: z.string().describe("File MIME type."),
  size: z.number().describe("File size in bytes."),
})

export const deleteMediaLibraryFilePublicRequest = z.object({
  fileId: zodBigintAsString().describe(
    "File id. Get it from `mediaLibrary.listFiles`.",
  ),
})

export const setMediaLibraryFavouritePublicRequest = z.object({
  fileId: zodBigintAsString().describe(
    "File id. Get it from `mediaLibrary.listFiles`.",
  ),
  isFavourite: z
    .boolean()
    .describe("Whether the file should be marked favourited."),
})

export const recordMediaLibraryFileAccessPublicRequest = z.object({
  fileId: zodBigintAsString().describe(
    "File id. Get it from `mediaLibrary.listFiles`.",
  ),
})

export const moveMediaLibraryFilesPublicRequest = z.object({
  fileIds: z
    .array(zodBigintAsString())
    .min(1)
    .describe("File ids to move. Get them from `mediaLibrary.listFiles`."),
  folderId: zodBigintAsString()
    .nullish()
    .describe("Destination folder id, or null to move to root-level."),
})
