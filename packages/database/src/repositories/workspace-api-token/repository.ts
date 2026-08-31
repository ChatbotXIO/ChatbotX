import { type DatabaseClient, db, eq } from "../../client"
import { workspaceApiTokenModel } from "../../schema"
import type { WorkspaceApiTokenModel } from "../../types"

class WorkspaceApiTokenRepository {
  async findByTokenHash(
    tokenHash: string,
    tx: DatabaseClient = db,
  ): Promise<WorkspaceApiTokenModel | null> {
    const row = await tx.query.workspaceApiTokenModel.findFirst({
      where: { tokenHash },
    })

    return row ?? null
  }

  async existsByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const row = await tx.query.workspaceApiTokenModel.findFirst({
      where: { workspaceId },
      columns: { id: true },
    })

    return row !== undefined
  }

  async deleteByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .delete(workspaceApiTokenModel)
      .where(eq(workspaceApiTokenModel.workspaceId, workspaceId))
  }

  async insert(
    input: { workspaceId: string; tokenHash: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx.insert(workspaceApiTokenModel).values({
      workspaceId: input.workspaceId,
      tokenHash: input.tokenHash,
    })
  }
}

export const workspaceApiTokenRepository = new WorkspaceApiTokenRepository()
