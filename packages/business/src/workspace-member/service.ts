import {
  and,
  type DatabaseClient,
  db,
  eq,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { workspaceMemberRoles } from "@chatbotx.io/database/partials"
import {
  type WorkspaceMemberPermissionsRow,
  workspaceMemberRepository,
} from "@chatbotx.io/database/repositories"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import { withCache } from "@chatbotx.io/redis"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { logger } from "../logger"
import { workspaceUsageService } from "../workspace-usage/service"

type ListWorkspaceMembersInput = {
  workspaceId: string
  page?: number | null
  perPage?: number | null
  keyword?: string | null
}

type WorkspaceMemberListRow = WorkspaceMemberModel & { user: UserModel }

type ListWorkspaceMembersResult = {
  data: WorkspaceMemberListRow[]
  pageCount: number
}

type WorkspaceMemberWithWorkspace = WorkspaceMemberModel & {
  workspace: WorkspaceModel
}

export const workspaceMemberCacheTag = (userId: string) =>
  `users:${userId}:workspace-members`

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

    await workspaceUsageService
      .increment(data.workspaceId, "teamMembers")
      .catch((err) => {
        logger.warn(
          { err, workspaceId: data.workspaceId },
          "workspace usage team member increment failed",
        )
      })

    return workspaceMember
  }

  async delete(props: {
    id: string
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { id, workspaceId, tx = db } = props

    const member = await tx.query.workspaceMemberModel.findFirst({
      where: { id, workspaceId },
      with: { user: true },
    })

    await tx
      .delete(workspaceMemberModel)
      .where(
        and(
          eq(workspaceMemberModel.id, id),
          eq(workspaceMemberModel.workspaceId, workspaceId),
        ),
      )

    await workspaceUsageService
      .decrement(workspaceId, "teamMembers")
      .catch((err) => {
        logger.warn(
          { err, workspaceId },
          "workspace usage team member decrement failed",
        )
      })

    if (!props.tx && member) {
      await this.audit(
        "delete",
        `removed ${member.user.name ?? member.user.email} from workspace`,
      )
    }
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
    const key = workspaceMemberCacheTag(props.userId)
    return await withCache(
      key,
      async () => await this.listByUserIdUncached(props),
      {
        tags: [workspaceMemberCacheTag(props.userId)],
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

  // Auth gate — membership must take effect immediately on removal, so this
  // intentionally skips withCache (unlike the list methods above). Does not
  // see platform-support access: that is a synthetic membership granted at
  // the call site when `isSupportAccessEnabled(workspace) && isSuperAdmin`,
  // never a real row here. See docs/support-access.md.
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

  // Auth gate — membership must take effect immediately on removal, so this
  // intentionally skips withCache (unlike the list methods above). See
  // findMembership for the platform-support-access note.
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

  async listUserIdsByWorkspaceId(props: {
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<string[]> {
    const { tx = db, workspaceId } = props
    const rows = await tx
      .select({ userId: workspaceMemberModel.userId })
      .from(workspaceMemberModel)
      .where(eq(workspaceMemberModel.workspaceId, workspaceId))

    return rows.map((row) => row.userId)
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

  /**
   * Bounded, UNCACHED projection over `WorkspaceMember.permissions` for
   * exactly `userIds` — the P2 ring-target snapshot's permissions read
   * (`whatsappVoipCallService.selectRingTargetsForCall`), which only needs
   * permissions for the already-bounded set of ONLINE user ids rather than
   * the whole cached roster `listByWorkspaceId` loads.
   */
  async listPermissionsByUserIds(props: {
    workspaceId: string
    userIds: string[]
    tx?: DatabaseClient
  }): Promise<WorkspaceMemberPermissionsRow[]> {
    return await workspaceMemberRepository.listPermissionsByUserIds(props)
  }

  /**
   * Persists an offline -> online transition (`onlineSince = now()`) in ONE
   * bulk UPDATE — called by `workspacePresenceService.heartbeatMany` with
   * exactly the subset of a presence report that Redis reports was NOT
   * already live, never with every reported user. A durable "last came
   * online" stamp for reporting only: Redis (`workspacePresenceService.
   * listOnlineMembers`) remains the sole source of truth for whether a
   * member is online RIGHT NOW, so there is no corresponding "mark
   * offline" write. Silent no-op for a user with no real `WorkspaceMember`
   * row in this workspace (a synthetic platform-support session, AGENTS.md
   * invariant #19) — see `workspaceMemberRepository.markOnlineBulk`.
   *
   * Side effect (LOW-9): this UPDATE also bumps `WorkspaceMember.updatedAt`
   * (the column's `.$onUpdate` default), same as any other write to the
   * row — harmless, but worth knowing if something ever keys off
   * `updatedAt` to mean "the member's profile changed". It also does NOT
   * invalidate `listByWorkspaceId`'s cache tag
   * (`workspaces:${workspaceId}:workspace-members`): a cached roster read
   * shortly after a presence transition can serve a stale `onlineSince`/
   * `updatedAt` until that cache entry naturally expires or is invalidated
   * by an unrelated membership write. Never a correctness issue for
   * presence itself (Redis is read separately, uncached, for that), only
   * for anything that reads `onlineSince` off the cached roster.
   */
  async markOnlineBulk(props: {
    workspaceId: string
    userIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    await workspaceMemberRepository.markOnlineBulk(props)
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

  async findWithUserByWorkspaceIdAndUserId(input: {
    tx?: DatabaseClient
    workspaceId: string
    userId: string
  }): Promise<(WorkspaceMemberModel & { user: UserModel }) | undefined> {
    const { tx = db, workspaceId, userId } = input

    return await tx.query.workspaceMemberModel.findFirst({
      where: {
        workspaceId,
        userId,
      },
      with: {
        user: true,
      },
    })
  }

  /**
   * Bulk membership validation for round-robin allocation — returns just the
   * user ids from `userIds` that are actually members of the workspace.
   */
  async listExistingUserIds(props: {
    workspaceId: string
    userIds: string[]
    tx?: DatabaseClient
  }): Promise<{ userId: string }[]> {
    const { workspaceId, userIds, tx = db } = props
    if (userIds.length === 0) {
      return []
    }
    return await tx.query.workspaceMemberModel.findMany({
      where: { workspaceId, userId: { in: userIds } },
      columns: { userId: true },
    })
  }

  async findByIdOrFail(input: {
    tx?: DatabaseClient
    id: string
    workspaceId: string
  }): Promise<WorkspaceMemberModel> {
    const { tx = db, id, workspaceId } = input
    const member = await tx.query.workspaceMemberModel.findFirst({
      where: { id, workspaceId },
    })
    if (!member) {
      throw notFoundException("Workspace member not found")
    }
    return member
  }

  async update(input: {
    tx?: DatabaseClient
    id: string
    workspaceId: string
    data: Partial<typeof workspaceMemberModel.$inferInsert>
  }): Promise<{ id: string } | undefined> {
    const { tx = db, id, workspaceId, data } = input

    const updated = await tx
      .update(workspaceMemberModel)
      .set(data)
      .where(
        and(
          eq(workspaceMemberModel.id, id),
          eq(workspaceMemberModel.workspaceId, workspaceId),
        ),
      )
      .returning({
        id: workspaceMemberModel.id,
        userId: workspaceMemberModel.userId,
      })

    const [row] = updated
    if (!row) {
      return
    }

    // The member's permissions/nav are served from the cached
    // `listByUserId` result; bust it so the change takes effect immediately.
    await this.invalidateCacheTags(workspaceMemberCacheTag(row.userId))

    return { id: row.id }
  }

  async listPaginated(
    input: ListWorkspaceMembersInput,
  ): Promise<ListWorkspaceMembersResult> {
    const pagination = getPaginationWithDefaults(input)

    const where = {
      workspaceId: input.workspaceId,
      user: input.keyword
        ? {
            name: {
              ilike: likeContains(input.keyword),
            },
          }
        : undefined,
    }

    const [data, totalRows] = await Promise.all([
      db.query.workspaceMemberModel.findMany({
        ...pagination,
        where,
        with: {
          user: true,
        },
      }),
      db.$count(
        workspaceMemberModel,
        relationsFilterToSQL(workspaceMemberModel, where),
      ),
    ])
    const pageCount = Math.ceil(totalRows / pagination.limit)

    return { data, pageCount }
  }

  async findByIdWithUser(input: {
    id: string
    workspaceId: string
  }): Promise<WorkspaceMemberListRow | undefined> {
    return await db.query.workspaceMemberModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
      with: {
        user: true,
      },
    })
  }
}

export const workspaceMemberService = new WorkspaceMemberService()
