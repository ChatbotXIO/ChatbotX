"use server"

import { db, eq, findOrFail, sql } from "@chatbotx.io/database/client"
import {
  mediaLibraryFileModel,
  mediaLibraryFolderModel,
} from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import { createId } from "@chatbotx.io/utils"
import { logger } from "@/lib/log"
import type {
  CreateFileRequest,
  CreateFolderRequest,
  DeleteFileRequest,
  DeleteFolderRequest,
  RenameFolderRequest,
  ToggleFavouriteRequest,
} from "../schemas"

export async function createMediaLibraryFolder(input: CreateFolderRequest) {
  const [folder] = await db
    .insert(mediaLibraryFolderModel)
    .values({
      id: createId(),
      name: input.name,
      workspaceId: input.workspaceId,
    })
    .returning()

  return folder
}

export async function renameMediaLibraryFolder(input: RenameFolderRequest) {
  await db
    .update(mediaLibraryFolderModel)
    .set({ name: input.name })
    .where(eq(mediaLibraryFolderModel.id, input.folderId))
}

export async function deleteMediaLibraryFolder(input: DeleteFolderRequest) {
  const files = await db.query.mediaLibraryFileModel.findMany({
    where: { folderId: input.folderId, workspaceId: input.workspaceId },
    columns: { id: true, path: true },
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
    await tx
      .delete(mediaLibraryFileModel)
      .where(eq(mediaLibraryFileModel.folderId, input.folderId))
    await tx
      .delete(mediaLibraryFolderModel)
      .where(eq(mediaLibraryFolderModel.id, input.folderId))
  })
}

export async function createMediaLibraryFile(input: CreateFileRequest) {
  const [file] = await db
    .insert(mediaLibraryFileModel)
    .values({
      id: createId(),
      workspaceId: input.workspaceId,
      folderId: input.folderId ?? null,
      name: input.name,
      path: input.path,
      mimeType: input.mimeType,
      size: input.size,
    })
    .returning()

  return file
}

export async function deleteMediaLibraryFile(input: DeleteFileRequest) {
  const file = await findOrFail({
    table: mediaLibraryFileModel,
    where: { id: input.fileId, workspaceId: input.workspaceId },
    message: `MediaLibraryFile ${input.fileId} not found`,
  })

  try {
    await uploader.deleteObject(file.path)
  } catch (error) {
    logger.warn(
      error,
      `deleteMediaLibraryFile: S3 delete failed for ${file.path}`,
    )
  }

  await db
    .delete(mediaLibraryFileModel)
    .where(eq(mediaLibraryFileModel.id, input.fileId))
}

export async function toggleMediaLibraryFavourite(
  input: ToggleFavouriteRequest,
) {
  const file = await findOrFail({
    table: mediaLibraryFileModel,
    where: { id: input.fileId, workspaceId: input.workspaceId },
    message: `MediaLibraryFile ${input.fileId} not found`,
  })

  await db
    .update(mediaLibraryFileModel)
    .set({ isFavourite: !file.isFavourite })
    .where(eq(mediaLibraryFileModel.id, input.fileId))
}

export async function recordMediaLibraryFileAccess(input: {
  workspaceId: string
  fileId: string
}) {
  await db
    .update(mediaLibraryFileModel)
    .set({ lastAccessedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(mediaLibraryFileModel.id, input.fileId))
}
