import { db } from "@chatbotx.io/database/client"
import {
  mediaLibraryFileRepository,
  mediaLibraryFolderRepository,
} from "@chatbotx.io/database/repositories"
import type { MediaLibraryFileModel } from "@chatbotx.io/database/types"
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

class MediaLibraryService extends BaseService {
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
