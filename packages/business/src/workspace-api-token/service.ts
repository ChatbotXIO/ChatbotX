import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { workspaceApiTokenModel } from "@chatbotx.io/database/schema"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { workspaceService } from "../workspace/service"

const workspaceApiTokensCacheTag = (workspaceId: string) =>
  `workspace-api-tokens:${workspaceId}`

class WorkspaceApiTokenService extends BaseService {
  async findWorkspaceByTokenHash(props: {
    tokenHash: string
    tx?: DatabaseClient
  }) {
    const { tokenHash, tx = db } = props

    return await withCache(
      `workspace-api-tokens:${tokenHash}`,
      async () => {
        const row = await tx.query.workspaceApiTokenModel.findFirst({
          where: { tokenHash },
        })
        if (!row) {
          return
        }
        return await workspaceService.findById({ id: row.workspaceId, tx })
      },
      {
        dynamicTags: (result) =>
          result ? [workspaceApiTokensCacheTag(result.id)] : undefined,
      },
    )
  }

  // Replace-write: single-token invariant until Track D adds scoped, named
  // tokens. Delete + insert inside one transaction so the row count never
  // exceeds one per workspace even under a retried caller.
  async replaceToken(props: {
    workspaceId: string
    tokenHash: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, tokenHash, tx = db } = props

    await tx.transaction(async (innerTx) => {
      await innerTx
        .delete(workspaceApiTokenModel)
        .where(eq(workspaceApiTokenModel.workspaceId, workspaceId))
      await innerTx
        .insert(workspaceApiTokenModel)
        .values({ workspaceId, tokenHash })
    })

    await this.invalidateCacheTags(workspaceApiTokensCacheTag(workspaceId))
  }
}

export const workspaceApiTokenService = new WorkspaceApiTokenService()
