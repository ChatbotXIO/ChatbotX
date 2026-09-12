import { db } from "@chatbotx.io/database/client"
import { fileContextTypes } from "@chatbotx.io/database/partials"
import {
  mediaLibraryFileRepository,
  mediaLibraryFolderRepository,
} from "@chatbotx.io/database/repositories"
import type {
  MediaLibraryFileModel,
  MediaLibraryFolderModel,
} from "@chatbotx.io/database/types"
import { uploader } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { fileService } from "../file/service"
import { logger } from "../logger"
import { resolveTenantSettings } from "../platform/settings"
import { getPublicFileUrl } from "../utils"

type CreateFileInput = {
  workspaceId: string
  folderId?: string | null
  name: string
  path: string
  mimeType: string
  size: number
}

type FolderWithFileCount = MediaLibraryFolderModel & { fileCount: number }

export type MediaLibraryFileWithUrl = MediaLibraryFileModel & { url: string }

class MediaLibraryService extends BaseService {
  /**
   * Folders for the sidebar, each carrying how many files it holds. The count
   * comes from a grouped aggregate rather than a per-folder query so the list
   * stays one round trip regardless of folder count.
   */
  async listFolders(input: {
    workspaceId: string
  }): Promise<FolderWithFileCount[]> {
    const { workspaceId } = input
    const [folders, fileCounts] = await Promise.all([
      mediaLibraryFolderRepository.listByWorkspace({ workspaceId }),
      mediaLibraryFileRepository.countByFolder({ workspaceId }),
    ])

    const fileCountByFolderId = new Map(
      fileCounts.map((row) => [row.folderId, row.count]),
    )

    return folders.map((folder) => ({
      ...folder,
      fileCount: fileCountByFolderId.get(folder.id) ?? 0,
    }))
  }

  async createFolder(input: {
    workspaceId: string
    name: string
  }): Promise<MediaLibraryFolderModel> {
    return await mediaLibraryFolderRepository.create({
      id: createId(),
      name: input.name,
      workspaceId: input.workspaceId,
    })
  }

  async renameFolder(input: {
    workspaceId: string
    folderId: string
    name: string
  }): Promise<void> {
    await mediaLibraryFolderRepository.rename({
      folderId: input.folderId,
      workspaceId: input.workspaceId,
      name: input.name,
    })
  }

  async moveFiles(input: {
    workspaceId: string
    fileIds: string[]
    folderId?: string | null
  }): Promise<void> {
    await mediaLibraryFileRepository.moveToFolder({
      workspaceId: input.workspaceId,
      fileIds: input.fileIds,
      folderId: input.folderId ?? null,
    })
  }

  /**
   * Stamps `lastAccessedAt` so the "Recent" filter reflects real usage. Scoped
   * by workspace, so a file id from another workspace touches nothing.
   */
  async recordFileAccess(input: {
    workspaceId: string
    fileId: string
  }): Promise<void> {
    await mediaLibraryFileRepository.touchLastAccessedAt({
      workspaceId: input.workspaceId,
      fileId: input.fileId,
    })
  }

  async deleteFolder(input: {
    workspaceId: string
    folderId: string
  }): Promise<void> {
    const { workspaceId, folderId } = input
    const files = await mediaLibraryFileRepository.listByFolder({
      workspaceId,
      folderId,
    })

    await db.transaction(async (tx) => {
      for (const file of files) {
        try {
          await uploader.deleteObject(file.path)
        } catch (error) {
          logger.warn(
            { err: error },
            `deleteMediaLibraryFolder: S3 delete failed for ${file.path}`,
          )
        }
      }
      await mediaLibraryFileRepository.deleteByFolder(
        { workspaceId, folderId },
        tx,
      )
      await mediaLibraryFolderRepository.deleteById(
        { folderId, workspaceId },
        tx,
      )
    })
  }

  async createFile(input: CreateFileInput): Promise<MediaLibraryFileWithUrl> {
    // `path` is client-supplied and must be confirmed to live under this
    // workspace's own storage prefix before we persist it — otherwise a
    // workspace member could register another workspace's real S3 object as
    // their own Media Library file, then delete it via
    // deleteMediaLibraryFileAction (see genericHandler's identical check in
    // apps/builder/src/lib/upload/handlers.ts).
    const isWorkspaceScopedPath =
      input.path.startsWith(`workspaces/${input.workspaceId}/`) ||
      input.path.startsWith(`public/space/${input.workspaceId}/`)
    if (!isWorkspaceScopedPath) {
      throw new ChatbotXException("Invalid file path", "invalidPath", 400)
    }

    const file = await mediaLibraryFileRepository.create({
      id: createId(),
      workspaceId: input.workspaceId,
      folderId: input.folderId ?? null,
      name: input.name,
      path: input.path,
      mimeType: input.mimeType,
      size: input.size,
    })

    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })

    return { ...file, url: getPublicFileUrl(file.path, storageUrl) }
  }

  /**
   * Mints a workspace-scoped storage key plus a presigned PUT URL (5 minutes)
   * for a Media Library upload. The key is derived here, never accepted from
   * the caller — `createFile` only validates the workspace prefix, so a
   * client-chosen key would be the cross-workspace vector that check exists
   * to close. Mirrors the prefix the builder's DirectUploadButton uses
   * (`public/space/<workspaceId>/media-library/...`) so token-uploaded and
   * UI-uploaded objects share one namespace.
   */
  async presignUpload(input: {
    workspaceId: string
    fileName: string
    mimeType: string
  }): Promise<{ path: string; uploadUrl: string; publicUrl: string }> {
    const path = `public/space/${input.workspaceId}/media-library/${createId()}`
    const uploadUrl = await uploader.getPresignedUpload(path)
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })
    const publicUrl = getPublicFileUrl(path, storageUrl)

    await fileService.createPending({
      workspaceId: input.workspaceId,
      userId: null,
      contextType: fileContextTypes.enum.generic,
      subType: "generic",
      path,
      fileName: input.fileName,
      mimeType: input.mimeType,
    })

    return { path, uploadUrl, publicUrl }
  }

  /**
   * Confirms a file exists in this workspace and returns it with a fetchable
   * `url` — backs the public API's get-one endpoint.
   */
  async findFile(input: {
    workspaceId: string
    fileId: string
  }): Promise<MediaLibraryFileWithUrl> {
    const file = await mediaLibraryFileRepository.findById({
      id: input.fileId,
      workspaceId: input.workspaceId,
    })
    if (!file) {
      throw notFoundException(`MediaLibraryFile ${input.fileId} not found`)
    }

    const { storageUrl } = await resolveTenantSettings({
      workspaceId: input.workspaceId,
    })

    return { ...file, url: getPublicFileUrl(file.path, storageUrl) }
  }

  async deleteFile(input: {
    workspaceId: string
    fileId: string
  }): Promise<void> {
    const file = await mediaLibraryFileRepository.findById({
      id: input.fileId,
      workspaceId: input.workspaceId,
    })
    if (!file) {
      throw notFoundException(`MediaLibraryFile ${input.fileId} not found`)
    }

    try {
      await uploader.deleteObject(file.path)
    } catch (error) {
      logger.warn(
        { err: error },
        `deleteMediaLibraryFile: S3 delete failed for ${file.path}`,
      )
    }

    await mediaLibraryFileRepository.deleteById({
      id: input.fileId,
      workspaceId: input.workspaceId,
    })
  }

  /**
   * Sets the explicit favourite state and returns the updated file with its
   * fetchable `url` — addressable by an API client, unlike a bare toggle.
   *
   * `preloadedFile` lets a caller that already fetched the row (e.g.
   * `toggleFavourite`, which needs the current state to flip it) skip the
   * redundant `findById` + `resolveTenantSettings` this method would
   * otherwise repeat.
   */
  async setFavourite(input: {
    workspaceId: string
    fileId: string
    isFavourite: boolean
    preloadedFile?: MediaLibraryFileWithUrl
  }): Promise<MediaLibraryFileWithUrl> {
    const file = input.preloadedFile ?? (await this.findFile(input))

    await mediaLibraryFileRepository.setFavourite({
      id: input.fileId,
      workspaceId: input.workspaceId,
      isFavourite: input.isFavourite,
    })

    return {
      ...file,
      isFavourite: input.isFavourite,
    }
  }

  async toggleFavourite(input: {
    workspaceId: string
    fileId: string
  }): Promise<MediaLibraryFileWithUrl> {
    const file = await this.findFile(input)
    return await this.setFavourite({
      ...input,
      isFavourite: !file.isFavourite,
      preloadedFile: file,
    })
  }
}

export const mediaLibraryService = new MediaLibraryService()
