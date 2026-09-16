import {
  mediaLibraryFileService,
  mediaLibraryService,
} from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { paginateInMemory } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createMediaLibraryFilePublicRequest,
  createMediaLibraryFolderPublicRequest,
  createMediaLibraryUploadUrlPublicRequest,
  createMediaLibraryUploadUrlPublicResponse,
  deleteMediaLibraryFilePublicRequest,
  deleteMediaLibraryFolderPublicRequest,
  getMediaLibraryFilePublicRequest,
  listMediaLibraryFilesPublicRequest,
  listMediaLibraryFilesPublicResponse,
  listMediaLibraryFoldersPublicRequest,
  listMediaLibraryFoldersPublicResponse,
  mediaLibraryFileListItemPublicResource,
  mediaLibraryFolderPublicResource,
  moveMediaLibraryFilesPublicRequest,
  recordMediaLibraryFileAccessPublicRequest,
  renameMediaLibraryFolderPublicRequest,
  setMediaLibraryFavouritePublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("media")

const tags = ["Media Library"]

export const mediaLibraryPublicRouter = {
  listFolders: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/media-library/folders",
      summary: "List media library folders",
      description:
        "Use this to find folder ids before listing its files with `mediaLibrary.listFiles` or moving files into it with `mediaLibrary.moveFiles`. Returns folders in this workspace.",
      tags,
    })
    .input(listMediaLibraryFoldersPublicRequest)
    .output(listMediaLibraryFoldersPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const folders = await mediaLibraryService.listFolders({
        workspaceId: context.workspace.id,
      })
      return paginateInMemory(folders, {
        page: input.page,
        perPage: input.perPage,
      })
    }),

  createFolder: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/media-library/folders",
      summary: "Create media library folder",
      description:
        "Adds a folder to organize media library files. Use `mediaLibrary.listFolders` first to avoid duplicating an existing folder.",
      successStatus: 201,
      tags,
    })
    .input(createMediaLibraryFolderPublicRequest)
    .output(mediaLibraryFolderPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await mediaLibraryService.createFolder({
          workspaceId: context.workspace.id,
          name: input.name,
        }),
    ),

  renameFolder: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/media-library/folders/{folderId}",
      summary: "Rename media library folder",
      description:
        "Changes a folder's display name without moving its files. Use `mediaLibrary.listFolders` to find its id first.",
      successStatus: 204,
      tags,
    })
    .input(renameMediaLibraryFolderPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await mediaLibraryService.renameFolder({
        workspaceId: context.workspace.id,
        folderId: input.folderId,
        name: input.name,
      })
    }),

  deleteFolder: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/media-library/folders/{folderId}",
      summary: "Delete media library folder and all its files",
      description:
        "Permanently deletes a folder and every file inside it, including their storage objects. Use `mediaLibrary.moveFiles` first to preserve files by moving them out.",
      successStatus: 204,
      tags,
    })
    .input(deleteMediaLibraryFolderPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await mediaLibraryService.deleteFolder({
        workspaceId: context.workspace.id,
        folderId: input.folderId,
      })
    }),

  createUploadUrl: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/media-library/files/upload-url",
      summary: "Create presigned upload URL for media library file",
      description:
        "Returns a storage `path` and a presigned `uploadUrl` (a 5-minute PUT URL). PUT the file bytes to `uploadUrl`, then pass the same `path` to POST /v1/media-library/files to register the file.",
      successStatus: 201,
      tags,
    })
    .input(createMediaLibraryUploadUrlPublicRequest)
    .output(createMediaLibraryUploadUrlPublicResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await mediaLibraryService.presignUpload({
          workspaceId: context.workspace.id,
          fileName: input.fileName,
          mimeType: input.mimeType,
        }),
    ),

  listFiles: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/media-library/files",
      summary: "List media library files",
      description:
        "Use this to find file ids before inspecting one with `mediaLibrary.getFile` or attaching one to a message. Returns files in this workspace.",
      tags,
    })
    .input(listMediaLibraryFilesPublicRequest)
    .output(listMediaLibraryFilesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await mediaLibraryFileService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  getFile: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/media-library/files/{fileId}",
      summary: "Get media library file",
      description:
        "Returns one file's metadata (path, mime type, size). Use `mediaLibrary.listFiles` to find its id first.",
      tags,
    })
    .input(getMediaLibraryFilePublicRequest)
    .output(mediaLibraryFileListItemPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await mediaLibraryService.findFile({
          workspaceId: context.workspace.id,
          fileId: input.fileId,
        }),
    ),

  createFile: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/media-library/files",
      summary: "Register uploaded file in media library",
      description:
        "Registers a file already uploaded to the storage path from `mediaLibrary.createUploadUrl`, making it appear in `mediaLibrary.listFiles`.",
      successStatus: 201,
      tags,
    })
    .input(createMediaLibraryFilePublicRequest)
    .output(mediaLibraryFileListItemPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await mediaLibraryService.createFile({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  deleteFile: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/media-library/files/{fileId}",
      summary: "Delete media library file and its storage object",
      description:
        "Permanently deletes a file's metadata and its underlying storage object. Use `mediaLibrary.listFiles` to find its id first.",
      successStatus: 204,
      tags,
    })
    .input(deleteMediaLibraryFilePublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await mediaLibraryService.deleteFile({
        workspaceId: context.workspace.id,
        fileId: input.fileId,
      })
    }),

  setFavourite: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/media-library/files/{fileId}/favourite",
      summary: "Set media library file favourite status",
      description:
        "Marks a file as favourited or not, without changing its other metadata.",
      tags,
    })
    .input(setMediaLibraryFavouritePublicRequest)
    .output(mediaLibraryFileListItemPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await mediaLibraryService.setFavourite({
          workspaceId: context.workspace.id,
          fileId: input.fileId,
          isFavourite: input.isFavourite,
        }),
    ),

  recordAccess: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/media-library/files/{fileId}/access",
      summary: "Record media file access",
      description:
        "Records that a file was viewed or used, updating its last-accessed timestamp for sorting/cleanup purposes.",
      successStatus: 204,
      tags,
    })
    .input(recordMediaLibraryFileAccessPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await mediaLibraryService.recordFileAccess({
        workspaceId: context.workspace.id,
        fileId: input.fileId,
      })
    }),

  moveFiles: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/media-library/files/move",
      summary: "Move media library files to another folder",
      description:
        "Moves the given files into a different folder, or to no folder if `folderId` is null.",
      successStatus: 204,
      tags,
    })
    .input(moveMediaLibraryFilesPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await mediaLibraryService.moveFiles({
        workspaceId: context.workspace.id,
        fileIds: input.fileIds,
        folderId: input.folderId,
      })
    }),
}
