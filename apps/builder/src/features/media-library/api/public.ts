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
      summary: "Create a media library folder",
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
      summary: "Rename a media library folder",
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
      summary: "Delete a media library folder and all its files",
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
      summary: "Create a presigned upload URL for a media library file",
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
      summary: "Get a media library file",
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
      summary: "Register an uploaded file in the media library",
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
      summary: "Delete a media library file and its storage object",
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
      summary: "Set a media library file's favourite status",
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
      summary:
        "Record that a media library file was used (feeds the recent filter)",
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
