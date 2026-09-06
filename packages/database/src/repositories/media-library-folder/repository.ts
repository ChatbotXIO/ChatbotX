import { and, type DatabaseClient, db, eq } from "../../client"
import { mediaLibraryFolderModel } from "../../schema"
import type { MediaLibraryFolderModel } from "../../types"

export const mediaLibraryFolderRepository = {
  listByWorkspace(
    input: { workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<MediaLibraryFolderModel[]> {
    return tx.query.mediaLibraryFolderModel.findMany({
      where: { workspaceId: input.workspaceId },
      orderBy: (t, { asc }) => [asc(t.name)],
    })
  },

  async create(
    values: typeof mediaLibraryFolderModel.$inferInsert,
    tx: DatabaseClient = db,
  ): Promise<MediaLibraryFolderModel> {
    const [folder] = await tx
      .insert(mediaLibraryFolderModel)
      .values(values)
      .returning()
    return folder
  },

  async rename(
    input: { folderId: string; workspaceId: string; name: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(mediaLibraryFolderModel)
      .set({ name: input.name })
      .where(
        and(
          eq(mediaLibraryFolderModel.id, input.folderId),
          eq(mediaLibraryFolderModel.workspaceId, input.workspaceId),
        ),
      )
  },

  async deleteById(
    input: { folderId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(mediaLibraryFolderModel)
      .where(
        and(
          eq(mediaLibraryFolderModel.id, input.folderId),
          eq(mediaLibraryFolderModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
