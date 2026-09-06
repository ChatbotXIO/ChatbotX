import {
  and,
  count,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
} from "../../client"
import { mediaLibraryFileModel } from "../../schema"
import type { MediaLibraryFileModel } from "../../types"

export type MediaLibraryFileFolderCount = {
  folderId: string | null
  count: number
}

export const mediaLibraryFileRepository = {
  countByFolder(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<MediaLibraryFileFolderCount[]> {
    return tx
      .select({
        folderId: mediaLibraryFileModel.folderId,
        count: count(),
      })
      .from(mediaLibraryFileModel)
      .where(eq(mediaLibraryFileModel.workspaceId, input.workspaceId))
      .groupBy(mediaLibraryFileModel.folderId)
  },

  listByFolder(
    input: { workspaceId: string; folderId: string },
    tx: DatabaseClient = db,
  ): Promise<Pick<MediaLibraryFileModel, "id" | "path">[]> {
    return tx.query.mediaLibraryFileModel.findMany({
      where: {
        folderId: input.folderId,
        workspaceId: input.workspaceId,
      },
      columns: { id: true, path: true },
    })
  },

  async create(
    values: typeof mediaLibraryFileModel.$inferInsert,
    tx: DatabaseClient = db,
  ): Promise<MediaLibraryFileModel> {
    const [file] = await tx
      .insert(mediaLibraryFileModel)
      .values(values)
      .returning()
    return file
  },

  async findById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<MediaLibraryFileModel | null> {
    const row = await tx.query.mediaLibraryFileModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    return row ?? null
  },

  async deleteById(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(mediaLibraryFileModel)
      .where(eq(mediaLibraryFileModel.id, input.id))
  },

  async deleteByFolder(
    input: { workspaceId: string; folderId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(mediaLibraryFileModel)
      .where(
        and(
          eq(mediaLibraryFileModel.folderId, input.folderId),
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
        ),
      )
  },

  async moveToFolder(
    input: { workspaceId: string; fileIds: string[]; folderId: string | null },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(mediaLibraryFileModel)
      .set({ folderId: input.folderId })
      .where(
        and(
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
          inArray(mediaLibraryFileModel.id, input.fileIds),
        ),
      )
  },

  async setFavourite(
    input: { id: string; isFavourite: boolean },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(mediaLibraryFileModel)
      .set({ isFavourite: input.isFavourite })
      .where(eq(mediaLibraryFileModel.id, input.id))
  },

  async touchLastAccessedAt(
    input: { workspaceId: string; fileId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(mediaLibraryFileModel)
      .set({ lastAccessedAt: sql`CURRENT_TIMESTAMP` })
      .where(
        and(
          eq(mediaLibraryFileModel.id, input.fileId),
          eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
