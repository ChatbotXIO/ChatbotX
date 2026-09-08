import { and, type DatabaseClient, db, eq } from "../../client"
import { fileModel } from "../../schema"
import type { FileModel } from "../../types"

export const fileRepository = {
  async create(values: typeof fileModel.$inferInsert, tx: DatabaseClient = db) {
    const [file] = await tx.insert(fileModel).values(values).returning()
    return file
  },
  /**
   * Ownership proof for a presigned-upload `File` row — scoped to
   * `(id, workspaceId)` so a caller can never probe another workspace's
   * upload by guessing a `fileId`. Used by the messaging-ad creative
   * preflight (and any future create-time bytes read-back) to verify a
   * caller-supplied `fileId` actually belongs to THIS workspace before its
   * `path` is trusted — never trust the request body's key alone.
   */
  async findByIdForWorkspace(
    input: { id: string; workspaceId: string; userId?: string },
    tx: DatabaseClient = db,
  ): Promise<FileModel | null> {
    const [row] = await tx
      .select()
      .from(fileModel)
      .where(
        and(
          eq(fileModel.id, input.id),
          eq(fileModel.workspaceId, input.workspaceId),
          input.userId ? eq(fileModel.userId, input.userId) : undefined,
        ),
      )
      .limit(1)
    return row ?? null
  },
}
