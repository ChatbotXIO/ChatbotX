"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  and,
  db,
  eq,
  findOrFail,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
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
  MoveFilesRequest,
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
    .where(
      and(
        eq(mediaLibraryFolderModel.id, input.folderId),
        eq(mediaLibraryFolderModel.workspaceId, input.workspaceId),
      ),
    )
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
      .where(
        and(
          eq(mediaLibraryFileModel.folderId, input.folderId),
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
        ),
      )
    await tx
      .delete(mediaLibraryFolderModel)
      .where(
        and(
          eq(mediaLibraryFolderModel.id, input.folderId),
          eq(mediaLibraryFolderModel.workspaceId, input.workspaceId),
        ),
      )
  })
}

export async function createMediaLibraryFile(input: CreateFileRequest) {
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

export async function moveMediaLibraryFiles(input: MoveFilesRequest) {
  await db
    .update(mediaLibraryFileModel)
    .set({ folderId: input.folderId ?? null })
    .where(
      and(
        eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
        inArray(mediaLibraryFileModel.id, input.fileIds),
      ),
    )
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
    .where(
      and(
        eq(mediaLibraryFileModel.id, input.fileId),
        eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
      ),
    )
}
