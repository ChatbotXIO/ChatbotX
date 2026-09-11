import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import {
  inboxTeamMemberModel,
  inboxTeamModel,
} from "@chatbotx.io/database/schema"
import type {
  InboxTeamMemberModel,
  InboxTeamModel,
  UserModel,
} from "@chatbotx.io/database/types"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../../base.service"
import { ChatbotXException, notFoundException } from "../../errors"
import { workspaceMemberService } from "../../workspace-member/service"

type InboxTeamWithMembers = InboxTeamModel & {
  inboxTeamMembers: (InboxTeamMemberModel & { user: UserModel })[]
}

class InboxTeamService extends BaseService {
  // ─── Reads (cached) ─────────────────────────────────────────────────────
  listByWorkspace(props: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<InboxTeamWithMembers[]> {
    const { workspaceId, tx = db } = props
    return withCache(
      `inbox-teams:${workspaceId}:list`,
      () =>
        tx.query.inboxTeamModel.findMany({
          where: { workspaceId },
          with: {
            inboxTeamMembers: {
              with: { user: true },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
      { tags: ["inbox-teams", `inbox-teams:${workspaceId}`] },
    )
  }

  // ─── Reads (NOT cached — write-path guard) ───────────────────────────────
  async findByIdOrFail(props: {
    workspaceId: string
    inboxTeamId: string
    tx?: DatabaseClient
  }): Promise<InboxTeamModel> {
    const { workspaceId, inboxTeamId, tx = db } = props
    const team = await tx.query.inboxTeamModel.findFirst({
      where: { id: inboxTeamId, workspaceId },
    })
    if (!team) {
      throw notFoundException("Inbox team not found")
    }
    return team
  }

  // ─── Writes ──────────────────────────────────────────────────────────────

  /** Rejects any userId that isn't an actual member of the workspace. */
  private async assertAllAreWorkspaceMembers(props: {
    workspaceId: string
    userIds: string[]
  }): Promise<void> {
    const { workspaceId, userIds } = props
    if (userIds.length === 0) {
      return
    }
    const existing = await workspaceMemberService.listExistingUserIds({
      workspaceId,
      userIds,
    })
    // Compare distinct user ids, not row counts: `WorkspaceMember` has no
    // unique constraint on (workspaceId, userId), so a user with two
    // membership rows would otherwise pad the count and let a non-member
    // through alongside them.
    const existingUserIds = new Set(existing.map((member) => member.userId))
    if (existingUserIds.size !== new Set(userIds).size) {
      throw new ChatbotXException(
        "One or more userIds are not members of this workspace",
        "invalidTeamMember",
        400,
      )
    }
  }

  async create(props: {
    workspaceId: string
    data: { name: string; userIds: string[] }
  }): Promise<InboxTeamModel> {
    const { workspaceId, data } = props
    await this.assertAllAreWorkspaceMembers({
      workspaceId,
      userIds: data.userIds,
    })
    const inboxTeamId = createId()
    const team = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(inboxTeamModel)
        .values({
          id: inboxTeamId,
          name: data.name,
          workspaceId,
        })
        .returning()
      if (!created) {
        throw new ChatbotXException(
          "Failed to create inbox team",
          "createFailed",
          500,
        )
      }
      if (data.userIds.length > 0) {
        await tx.insert(inboxTeamMemberModel).values(
          // `InboxTeamMember` has no `workspaceId` column — tenant isolation
          // is transitive via `inboxTeamId -> InboxTeam.workspaceId`. Drizzle
          // silently drops an unknown key, so an extra one is dead payload.
          data.userIds.map((userId) => ({
            id: createId(),
            userId,
            inboxTeamId,
          })),
        )
      }
      return created
    })
    await this.invalidate({ workspaceId })
    await this.audit("create", `created a new team (#${inboxTeamId})`)
    return team
  }

  async update(
    ctx: { workspaceId: string; inboxTeamId: string },
    data: { name?: string },
  ): Promise<InboxTeamModel> {
    const team = await this.findByIdOrFail(ctx)
    const [updated] = await db
      .update(inboxTeamModel)
      .set(data)
      .where(eq(inboxTeamModel.id, team.id))
      .returning()
    await this.invalidate({ workspaceId: ctx.workspaceId })

    if (data.name !== undefined && data.name !== team.name) {
      await this.audit("update", `updated a team (#${team.id})`)
    }
    return updated ?? team
  }

  async delete(props: { workspaceId: string; ids: string[] }): Promise<void> {
    const { workspaceId, ids } = props

    const teams = await db.query.inboxTeamModel.findMany({
      where: { workspaceId, id: { in: ids } },
      columns: { id: true },
    })
    if (teams.length === 0) {
      throw notFoundException("Inbox team not found")
    }

    await db
      .delete(inboxTeamModel)
      .where(
        and(
          eq(inboxTeamModel.workspaceId, workspaceId),
          inArray(inboxTeamModel.id, ids),
        ),
      )
    await this.invalidate({ workspaceId })

    if (teams.length > 0) {
      await this.audit(
        "delete",
        `deleted team${teams.length > 1 ? "s" : ""} (${teams.map((team) => `#${team.id}`).join(", ")})`,
      )
    }
  }

  async addMembers(
    ctx: { workspaceId: string; inboxTeamId: string },
    userIds: string[],
  ): Promise<InboxTeamModel> {
    const team = await this.findByIdOrFail(ctx)
    await this.assertAllAreWorkspaceMembers({
      workspaceId: ctx.workspaceId,
      userIds,
    })
    let addedUsers: Array<{ name: string | null; email: string }> = []
    await db.transaction(async (tx) => {
      const existingMembers = await tx.query.inboxTeamMemberModel.findMany({
        where: {
          userId: { in: userIds },
          inboxTeamId: team.id,
        },
        columns: { userId: true },
      })
      const existingUserIds = new Set(
        existingMembers.map((member) => member.userId),
      )
      const newUserIds = userIds.filter((id) => !existingUserIds.has(id))
      if (newUserIds.length > 0) {
        await tx.insert(inboxTeamMemberModel).values(
          newUserIds.map((userId) => ({
            id: createId(),
            userId,
            inboxTeamId: ctx.inboxTeamId,
          })),
        )
        addedUsers = await tx.query.userModel.findMany({
          where: { id: { in: newUserIds } },
          columns: { name: true, email: true },
        })
      }
    })
    await this.invalidate({ workspaceId: ctx.workspaceId })

    if (addedUsers.length > 0) {
      await this.audit(
        "update",
        `added ${addedUsers.map((user) => user.name ?? user.email).join(", ")} to the team (#${team.id})`,
      )
    }
    return team
  }

  async removeMembers(
    ctx: { workspaceId: string; inboxTeamId: string },
    memberIds: string[],
  ): Promise<InboxTeamModel> {
    const team = await this.findByIdOrFail(ctx)
    const membersToRemove = await db.query.inboxTeamMemberModel.findMany({
      where: {
        id: { in: memberIds },
        inboxTeamId: team.id,
      },
      with: { user: true },
    })

    const deleted = await db
      .delete(inboxTeamMemberModel)
      .where(
        and(
          eq(inboxTeamMemberModel.inboxTeamId, team.id),
          inArray(inboxTeamMemberModel.id, memberIds),
        ),
      )
      .returning({ id: inboxTeamMemberModel.id })
    await this.invalidate({ workspaceId: ctx.workspaceId })

    if (deleted.length > 0) {
      await this.audit(
        "update",
        `removed ${membersToRemove.map((member) => member.user.name ?? member.user.email).join(", ")} from the team (#${team.id})`,
      )
    }
    return team
  }

  /**
   * Removes members by userId rather than membership-row id. The public API
   * only ever hands clients userIds (addMembers takes userIds and the bare
   * team resource has no members array to read row ids back from), so it
   * calls this instead of removeMembers.
   */
  async removeMembersByUserIds(
    ctx: { workspaceId: string; inboxTeamId: string },
    userIds: string[],
  ): Promise<InboxTeamModel> {
    const team = await this.findByIdOrFail(ctx)
    const membersToRemove = await db.query.inboxTeamMemberModel.findMany({
      where: {
        userId: { in: userIds },
        inboxTeamId: team.id,
      },
      with: { user: true },
    })

    const deleted = await db
      .delete(inboxTeamMemberModel)
      .where(
        and(
          eq(inboxTeamMemberModel.inboxTeamId, team.id),
          inArray(inboxTeamMemberModel.userId, userIds),
        ),
      )
      .returning({ id: inboxTeamMemberModel.id })
    await this.invalidate({ workspaceId: ctx.workspaceId })

    if (deleted.length > 0) {
      await this.audit(
        "update",
        `removed ${membersToRemove.map((member) => member.user.name ?? member.user.email).join(", ")} from the team (#${team.id})`,
      )
    }
    return team
  }

  // ─── Cache ───────────────────────────────────────────────────────────────
  async invalidate(props: { workspaceId: string }): Promise<void> {
    await this.invalidateCacheTags([
      "inbox-teams",
      `inbox-teams:${props.workspaceId}`,
    ])
  }

  /** Validate one assignee team id (flow-step assign). */
  async exists(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const { workspaceId, id, tx = db } = props
    const team = await tx.query.inboxTeamModel.findFirst({
      where: { id, workspaceId },
      columns: { id: true },
    })
    return Boolean(team)
  }

  /** Bulk team validation for round-robin allocation. */
  async listExistingIds(props: {
    workspaceId: string
    ids: string[]
    tx?: DatabaseClient
  }): Promise<{ id: string }[]> {
    const { workspaceId, ids, tx = db } = props
    if (ids.length === 0) {
      return []
    }
    return await tx.query.inboxTeamModel.findMany({
      where: { workspaceId, id: { in: ids } },
      columns: { id: true },
    })
  }
}

export const inboxTeamService = new InboxTeamService()
