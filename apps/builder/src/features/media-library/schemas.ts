import {
  createSelectSchema,
  mediaLibraryFileModel,
  mediaLibraryFolderModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const mediaLibraryFolderResource = createSelectSchema(
  mediaLibraryFolderModel,
  {
    id: zodBigintAsString(),
    workspaceId: zodBigintAsString(),
  },
)

export const mediaLibraryFileResource = createSelectSchema(
  mediaLibraryFileModel,
  {
    id: zodBigintAsString(),
    workspaceId: zodBigintAsString(),
    folderId: zodBigintAsString().nullish(),
  },
)

// Folder requests
export const listFoldersRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListFoldersRequest = z.infer<typeof listFoldersRequest>

export const listFoldersResponse = z.object({
  data: z.array(
    mediaLibraryFolderResource.extend({
      fileCount: z.number(),
    }),
  ),
})
export type ListFoldersResponse = z.infer<typeof listFoldersResponse>

export const createFolderRequest = z.object({
  workspaceId: zodBigintAsString(),
  name: z.string().min(1),
})
export type CreateFolderRequest = z.infer<typeof createFolderRequest>

export const createFolderResponse = mediaLibraryFolderResource
export type CreateFolderResponse = z.infer<typeof createFolderResponse>

export const renameFolderRequest = z.object({
  workspaceId: zodBigintAsString(),
  folderId: zodBigintAsString(),
  name: z.string().min(1),
})
export type RenameFolderRequest = z.infer<typeof renameFolderRequest>

export const deleteFolderRequest = z.object({
  workspaceId: zodBigintAsString(),
  folderId: zodBigintAsString(),
})
export type DeleteFolderRequest = z.infer<typeof deleteFolderRequest>

// File requests
export const MEDIA_LIBRARY_FILES_PAGE_SIZE = 60

export const listFilesRequest = z.object({
  workspaceId: zodBigintAsString(),
  folderId: zodBigintAsString().nullish(),
  search: z.string().optional(),
  filter: z.enum(["recent", "favourite"]).optional(),
  page: z.number().int().min(1).optional(),
})
export type ListFilesRequest = z.infer<typeof listFilesRequest>

export const listFilesResponse = z.object({
  data: z.array(
    mediaLibraryFileResource.extend({
      url: z.string(),
    }),
  ),
})
export type ListFilesResponse = z.infer<typeof listFilesResponse>

export const createFileRequest = z.object({
  workspaceId: zodBigintAsString(),
  folderId: zodBigintAsString().nullish(),
  name: z.string(),
  path: z.string(),
  mimeType: z.string(),
  size: z.number(),
})
export type CreateFileRequest = z.infer<typeof createFileRequest>

export const createFileInputSchema = z.object({
  folderId: zodBigintAsString().nullish(),
  name: z.string(),
  path: z.string(),
  mimeType: z.string(),
  size: z.number(),
})
export type CreateFileInput = z.infer<typeof createFileInputSchema>

export const deleteFileRequest = z.object({
  workspaceId: zodBigintAsString(),
  fileId: zodBigintAsString(),
})
export type DeleteFileRequest = z.infer<typeof deleteFileRequest>

export const moveFilesRequest = z.object({
  workspaceId: zodBigintAsString(),
  fileIds: z.array(zodBigintAsString()).min(1),
  folderId: zodBigintAsString().nullish(),
})
export type MoveFilesRequest = z.infer<typeof moveFilesRequest>

export const toggleFavouriteRequest = z.object({
  workspaceId: zodBigintAsString(),
  fileId: zodBigintAsString(),
})
export type ToggleFavouriteRequest = z.infer<typeof toggleFavouriteRequest>

export const recordFileAccessRequest = z.object({
  workspaceId: zodBigintAsString(),
  fileId: zodBigintAsString(),
})
export type RecordFileAccessRequest = z.infer<typeof recordFileAccessRequest>
