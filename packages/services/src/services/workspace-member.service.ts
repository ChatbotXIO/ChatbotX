import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type {
  UserModel,
  WorkspaceMemberModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "./base.service"

class WorkspaceMemberService extends BaseService {
  async listByWorkspaceId(props: {
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<(WorkspaceMemberModel & { user: UserModel })[]> {
    const { tx = db, workspaceId } = props
    const key = `workspaces:${workspaceId}:workspace-members`

    return await withCache(
      key,
      async () =>
        await tx.query.workspaceMemberModel.findMany({
          where: { workspaceId },
          with: {
            user: true,
          },
          orderBy: { createdAt: "asc" },
        }),
      {
        tags: [
          `workspaces:${workspaceId}`,
          `workspaces:${workspaceId}:workspace-members`,
        ],
      },
    )
  }
}

export const workspaceMemberService = new WorkspaceMemberService()
