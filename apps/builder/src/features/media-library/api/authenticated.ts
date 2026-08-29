import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listMediaLibraryFiles, listMediaLibraryFolders } from "../queries"
import {
  createMediaLibraryFile,
  createMediaLibraryFolder,
  deleteMediaLibraryFile,
  deleteMediaLibraryFolder,
  renameMediaLibraryFolder,
  toggleMediaLibraryFavourite,
} from "../queries/mutations"
import {
  createFileRequest,
  createFolderRequest,
  createFolderResponse,
  deleteFileRequest,
  deleteFolderRequest,
  listFilesRequest,
  listFilesResponse,
  listFoldersRequest,
  listFoldersResponse,
  mediaLibraryFileResource,
  renameFolderRequest,
  toggleFavouriteRequest,
} from "../schemas"

export const mediaLibraryAuthenticatedAPI = {
  listMediaLibraryFolders: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/media-library/folders",
      summary: "List media library folders",
      tags: ["Media Library"],
    })
    .input(listFoldersRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listFoldersResponse)
    .handler(async ({ input }) => listMediaLibraryFolders(input)),

  createMediaLibraryFolder: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/media-library/folders",
      summary: "Create media library folder",
      tags: ["Media Library"],
    })
    .input(createFolderRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(createFolderResponse)
    .handler(async ({ input }) => createMediaLibraryFolder(input)),

  renameMediaLibraryFolder: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/media-library/folders/{folderId}",
      summary: "Rename media library folder",
      tags: ["Media Library"],
    })
    .input(renameFolderRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => renameMediaLibraryFolder(input)),

  deleteMediaLibraryFolder: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/media-library/folders/{folderId}",
      summary: "Delete media library folder and all its files from S3",
      tags: ["Media Library"],
    })
    .input(deleteFolderRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => deleteMediaLibraryFolder(input)),

  listMediaLibraryFiles: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/media-library/files",
      summary: "List media library files",
      tags: ["Media Library"],
    })
    .input(listFilesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listFilesResponse)
    .handler(async ({ input }) => listMediaLibraryFiles(input)),

  createMediaLibraryFile: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/media-library/files",
      summary: "Register an uploaded file in the media library",
      tags: ["Media Library"],
    })
    .input(createFileRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(mediaLibraryFileResource)
    .handler(async ({ input }) => createMediaLibraryFile(input)),

  deleteMediaLibraryFile: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/media-library/files/{fileId}",
      summary: "Delete a media library file and its S3 object",
      tags: ["Media Library"],
    })
    .input(deleteFileRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => deleteMediaLibraryFile(input)),

  toggleMediaLibraryFavourite: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/media-library/files/{fileId}/favourite",
      summary: "Toggle file favourite status",
      tags: ["Media Library"],
    })
    .input(toggleFavouriteRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => toggleMediaLibraryFavourite(input)),
}
