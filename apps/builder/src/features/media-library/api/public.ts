import {
  mediaLibraryFileService,
  mediaLibraryService,
} from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createMediaLibraryFilePublicRequest,
  createMediaLibraryFolderPublicRequest,
  deleteMediaLibraryFilePublicRequest,
  deleteMediaLibraryFolderPublicRequest,
  listMediaLibraryFilesPublicRequest,
  listMediaLibraryFilesPublicResponse,
  listMediaLibraryFoldersPublicRequest,
  listMediaLibraryFoldersPublicResponse,
  mediaLibraryFilePublicResource,
  mediaLibraryFolderPublicResource,
  moveMediaLibraryFilesPublicRequest,
  renameMediaLibraryFolderPublicRequest,
  toggleMediaLibraryFavouritePublicRequest,
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
    .handler(async ({ context }) => ({
      data: await mediaLibraryService.listFolders({
        workspaceId: context.workspace.id,
      }),
    })),

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

  createFile: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/media-library/files",
      summary: "Register an uploaded file in the media library",
      successStatus: 201,
      tags,
    })
    .input(createMediaLibraryFilePublicRequest)
    .output(mediaLibraryFilePublicResource)
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

  toggleFavourite: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/media-library/files/{fileId}/favourite",
      summary: "Toggle a media library file's favourite status",
      tags,
    })
    .input(toggleMediaLibraryFavouritePublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await mediaLibraryService.toggleFavourite({
        workspaceId: context.workspace.id,
        fileId: input.fileId,
      })
    }),

  moveFiles: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/media-library/files/move",
      summary: "Move media library files to another folder",
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
