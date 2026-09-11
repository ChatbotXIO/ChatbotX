import { db } from "@chatbotx.io/database/client"
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
import { logger } from "../logger"

type CreateFileInput = {
  workspaceId: string
  folderId?: string | null
  name: string
  path: string
  mimeType: string
  size: number
}

type FolderWithFileCount = MediaLibraryFolderModel & { fileCount: number }

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
            error,
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

  async createFile(input: CreateFileInput): Promise<MediaLibraryFileModel> {
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

    return await mediaLibraryFileRepository.create({
      id: createId(),
      workspaceId: input.workspaceId,
      folderId: input.folderId ?? null,
      name: input.name,
      path: input.path,
      mimeType: input.mimeType,
      size: input.size,
    })
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
        error,
        `deleteMediaLibraryFile: S3 delete failed for ${file.path}`,
      )
    }

    await mediaLibraryFileRepository.deleteById({ id: input.fileId })
  }

  async toggleFavourite(input: {
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

    await mediaLibraryFileRepository.setFavourite({
      id: input.fileId,
      isFavourite: !file.isFavourite,
    })
  }
}

export const mediaLibraryService = new MediaLibraryService()
