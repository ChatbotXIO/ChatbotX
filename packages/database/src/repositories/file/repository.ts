import { and, type DatabaseClient, db, eq } from "../../client"
import { fileModel } from "../../schema"
import type { FileModel } from "../../types"

export const fileRepository = {
  /**
   * Updates a `File` row scoped to `(id, workspaceId)` so a caller can never
   * write another workspace's upload row. Used by the contact-export job to
   * persist progress/status on its own export file.
   */
  async updateForWorkspace(
    input: {
      id: string
      workspaceId: string
      values: Partial<typeof fileModel.$inferInsert>
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(fileModel)
      .set(input.values)
      .where(
        and(
          eq(fileModel.id, input.id),
          eq(fileModel.workspaceId, input.workspaceId),
        ),
      )
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
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<FileModel | null> {
    const [row] = await tx
      .select()
      .from(fileModel)
      .where(
        and(
          eq(fileModel.id, input.id),
          eq(fileModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },
}
