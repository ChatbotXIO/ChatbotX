import { and, type DatabaseClient, db, eq } from "../../client"
import type { WorkspaceApiTokenPermission } from "../../partials/workspace-api-token"
import { workspaceApiTokenModel } from "../../schema"
import type { WorkspaceApiTokenModel } from "../../types"

type InsertWorkspaceApiTokenInput = {
  workspaceId: string
  tokenHash: string
  name: string
  permission: WorkspaceApiTokenPermission
  tokenPrefix: string
}

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

  async listByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<WorkspaceApiTokenModel[]> {
    return await tx.query.workspaceApiTokenModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    })
  }

  async countByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      workspaceApiTokenModel,
      eq(workspaceApiTokenModel.workspaceId, workspaceId),
    )
  }

  async deleteByIdForWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .delete(workspaceApiTokenModel)
      .where(
        and(
          eq(workspaceApiTokenModel.id, input.id),
          eq(workspaceApiTokenModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: workspaceApiTokenModel.id })

    return rows.length > 0
  }

  async insert(
    input: InsertWorkspaceApiTokenInput,
    tx: DatabaseClient = db,
  ): Promise<WorkspaceApiTokenModel> {
    const [row] = await tx
      .insert(workspaceApiTokenModel)
      .values({
        workspaceId: input.workspaceId,
        tokenHash: input.tokenHash,
        name: input.name,
        permission: input.permission,
        tokenPrefix: input.tokenPrefix,
      })
      .returning()

    return row
  }
}

export const workspaceApiTokenRepository = new WorkspaceApiTokenRepository()
