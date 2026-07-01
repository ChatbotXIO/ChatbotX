import { and, type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { workspaceMemberRoles } from "@chatbotx.io/database/partials"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"

type WorkspaceMemberWithWorkspace = WorkspaceMemberModel & {
  workspace: WorkspaceModel
}

export class WorkspaceMemberService extends BaseService {
  async create(props: {
    tx?: DatabaseClient
    data: typeof workspaceMemberModel.$inferInsert
  }): Promise<WorkspaceMemberModel> {
    const { tx = db, data } = props
    const [workspaceMember] = await tx
      .insert(workspaceMemberModel)
      .values(data)
      .returning()

    return workspaceMember
  }

  async listByUserIdUncached(props: {
    tx?: DatabaseClient
    userId: string
  }): Promise<WorkspaceMemberWithWorkspace[]> {
    const { tx = db, userId } = props

    return await tx.query.workspaceMemberModel.findMany({
      where: {
        userId,
      },
      with: {
        workspace: true,
      },
    })
  }

  async listByUserId(props: {
    tx?: DatabaseClient
    userId: string
  }): Promise<WorkspaceMemberWithWorkspace[]> {
    const key = `users:${props.userId}:workspace-members`
    return await withCache(
      key,
      async () => await this.listByUserIdUncached(props),
      {
        tags: [`users:${props.userId}:workspace-members`],
      },
    )
  }

  async findOwnerUserIdByWorkspaceId(props: {
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<string | undefined> {
    const { tx = db, workspaceId } = props
    const key = `workspaces:${workspaceId}:owner-user-id`

    return await withCache(
      key,
      async () => {
        const [row] = await tx
          .select({ userId: workspaceMemberModel.userId })
          .from(workspaceMemberModel)
          .where(
            and(
              eq(workspaceMemberModel.workspaceId, workspaceId),
              eq(workspaceMemberModel.role, workspaceMemberRoles.enum.owner),
            ),
          )
          .limit(1)

        return row?.userId
      },
      {
        tags: [
          `workspaces:${workspaceId}`,
          `workspaces:${workspaceId}:workspace-members`,
        ],
      },
    )
  }

  async findMembership(props: {
    tx?: DatabaseClient
    workspaceId: string
    userId: string
  }): Promise<WorkspaceMemberWithWorkspace | undefined> {
    const { tx = db, workspaceId, userId } = props
    return await tx.query.workspaceMemberModel.findFirst({
      where: { workspaceId, userId },
      with: { workspace: true },
    })
  }

  // Auth gate — membership must take effect immediately on revoke, so this
  // intentionally skips withCache (unlike the list methods above).
  async isMember(props: {
    tx?: DatabaseClient
    workspaceId: string
    userId: string
  }): Promise<boolean> {
    const { tx = db, workspaceId, userId } = props
    const [row] = await tx
      .select({ userId: workspaceMemberModel.userId })
      .from(workspaceMemberModel)
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, workspaceId),
          eq(workspaceMemberModel.userId, userId),
        ),
      )
      .limit(1)
    return !!row
  }

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

  async findByWorkspaceIdAndUserId(input: {
    tx?: DatabaseClient
    workspaceId: string
    userId: string
  }): Promise<WorkspaceMemberModel | undefined> {
    const { tx = db, workspaceId, userId } = input

    return await tx.query.workspaceMemberModel.findFirst({
      where: {
        workspaceId,
        userId,
      },
    })
  }
}

export const workspaceMemberService = new WorkspaceMemberService()
