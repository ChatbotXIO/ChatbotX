import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import type {
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"

type WorkspaceMemberWithWorkspace = WorkspaceMemberModel & {
  workspace: WorkspaceModel
}

export const workspaceMemberService = {
  create: async (props: {
    tx?: DatabaseClient
    data: typeof workspaceMemberModel.$inferInsert
  }): Promise<WorkspaceMemberModel> => {
    const { tx = db, data } = props
    const [workspaceMember] = await tx
      .insert(workspaceMemberModel)
      .values(data)
      .returning()

    return workspaceMember
  },
  listByUserIdUncached: (props: {
    tx?: DatabaseClient
    userId: string
  }): Promise<WorkspaceMemberWithWorkspace[]> => {
    const { tx = db, userId } = props

    return tx.query.workspaceMemberModel.findMany({
      where: {
        userId,
      },
      with: {
        workspace: true,
      },
    })
  },
  listByUserId: (props: {
    tx?: DatabaseClient
    userId: string
  }): Promise<WorkspaceMemberWithWorkspace[]> => {
    const key = `users:${props.userId}:workspace-members`
    return withCache(
      key,
      () => workspaceMemberService.listByUserIdUncached(props),
      {
        dynamicTags: async (distributedStore, result) => {
          await Promise.all(
            result.map((workspaceMember) =>
              distributedStore.sadd(
                `workspaces:${workspaceMember.workspace.id}:members`,
                key,
              ),
            ),
          )
        },
      },
    )
  },
}
