import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "./base.service"

class WorkspaceService extends BaseService {
  async findById(props: {
    tx?: DatabaseClient
    id: string
  }): Promise<WorkspaceModel | undefined> {
    const { tx = db, id } = props
    const key = `workspaces:${id}`

    return await withCache(
      key,
      async () =>
        await tx.query.workspaceModel.findFirst({
          where: { id },
        }),
      {
        tags: ["workspaces", `workspaces:${id}`],
      },
    )
  }
}

export const workspaceService = new WorkspaceService()
