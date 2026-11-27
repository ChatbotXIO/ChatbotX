import { and, asc, type DatabaseClient, db, eq, inArray } from "../../client"
import { mediaLibraryFileModel, savedReplyImageModel } from "../../schema"
import type { MediaLibraryFileModel } from "../../types"

export type SavedReplyImageWithFile = {
  id: string
  savedReplyId: string
  mediaLibraryFileId: string
  position: number
  file: Pick<MediaLibraryFileModel, "name" | "path" | "mimeType" | "size">
}

export const savedReplyImageRepository = {
  /** How many saved replies still point at a media file. */
  async countReferences(
    mediaLibraryFileId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      savedReplyImageModel,
      eq(savedReplyImageModel.mediaLibraryFileId, mediaLibraryFileId),
    )
  },

  async listBySavedReplyIds(
    input: { workspaceId: string; savedReplyIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<SavedReplyImageWithFile[]> {
    if (input.savedReplyIds.length === 0) {
      return []
    }

    const rows = await tx
      .select({
        id: savedReplyImageModel.id,
        savedReplyId: savedReplyImageModel.savedReplyId,
        mediaLibraryFileId: savedReplyImageModel.mediaLibraryFileId,
        position: savedReplyImageModel.position,
        name: mediaLibraryFileModel.name,
        path: mediaLibraryFileModel.path,
        mimeType: mediaLibraryFileModel.mimeType,
        size: mediaLibraryFileModel.size,
      })
      .from(savedReplyImageModel)
      .innerJoin(
        mediaLibraryFileModel,
        eq(mediaLibraryFileModel.id, savedReplyImageModel.mediaLibraryFileId),
      )
      .where(
        and(
          eq(savedReplyImageModel.workspaceId, input.workspaceId),
          inArray(savedReplyImageModel.savedReplyId, input.savedReplyIds),
        ),
      )
      .orderBy(asc(savedReplyImageModel.position))

    return rows.map(({ name, path, mimeType, size, ...image }) => ({
      ...image,
      file: { name, path, mimeType, size },
    }))
  },

  countBySavedReplyId(
    input: { workspaceId: string; savedReplyId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return tx.$count(
      savedReplyImageModel,
      and(
        eq(savedReplyImageModel.workspaceId, input.workspaceId),
        eq(savedReplyImageModel.savedReplyId, input.savedReplyId),
      ),
    )
  },

  /** Replaces the whole ordered image list of one saved reply. */
  async replaceForSavedReply(
    input: {
      workspaceId: string
      savedReplyId: string
      mediaLibraryFileIds: string[]
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(savedReplyImageModel)
      .where(
        and(
          eq(savedReplyImageModel.workspaceId, input.workspaceId),
          eq(savedReplyImageModel.savedReplyId, input.savedReplyId),
        ),
      )

    if (input.mediaLibraryFileIds.length === 0) {
      return
    }

    await tx.insert(savedReplyImageModel).values(
      input.mediaLibraryFileIds.map((mediaLibraryFileId, position) => ({
        workspaceId: input.workspaceId,
        savedReplyId: input.savedReplyId,
        mediaLibraryFileId,
        position,
      })),
    )
  },
}
