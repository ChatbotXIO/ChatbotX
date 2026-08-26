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
import { notFoundException } from "../../errors"

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
  async create(props: {
    workspaceId: string
    data: { name: string; userIds: string[] }
  }): Promise<void> {
    const { workspaceId, data } = props
    const inboxTeamId = createId()
    await db.transaction(async (tx) => {
      await tx.insert(inboxTeamModel).values({
        id: inboxTeamId,
        name: data.name,
        workspaceId,
      })
      if (data.userIds.length > 0) {
        await tx.insert(inboxTeamMemberModel).values(
          data.userIds.map((userId) => ({
            id: createId(),
            userId,
            workspaceId,
            inboxTeamId,
          })),
        )
      }
    })
    await this.invalidate({ workspaceId })
    await this.audit("create", `created a new team (#${inboxTeamId})`)
  }

  async update(
    ctx: { workspaceId: string; inboxTeamId: string },
    data: { name?: string },
  ): Promise<void> {
    const team = await this.findByIdOrFail(ctx)
    await db
      .update(inboxTeamModel)
      .set(data)
      .where(eq(inboxTeamModel.id, team.id))
    await this.invalidate({ workspaceId: ctx.workspaceId })

    if (data.name !== undefined && data.name !== team.name) {
      await this.audit("update", `updated a team (#${team.id})`)
    }
  }

  async delete(props: { workspaceId: string; ids: string[] }): Promise<void> {
    const { workspaceId, ids } = props

    const teams = await db.query.inboxTeamModel.findMany({
      where: { workspaceId, id: { in: ids } },
      columns: { id: true },
    })

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
        `deleted team${teams.length > 1 ? "s" : ""} ${teams.map((team) => `#${team.id}`).join(", ")}`,
      )
    }
  }

  async addMembers(
    ctx: { workspaceId: string; inboxTeamId: string },
    userIds: string[],
  ): Promise<void> {
    const team = await this.findByIdOrFail(ctx)
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
            workspaceId: ctx.workspaceId,
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
  }

  async removeMembers(
    ctx: { workspaceId: string; inboxTeamId: string },
    memberIds: string[],
  ): Promise<void> {
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
  }

  // ─── Cache ───────────────────────────────────────────────────────────────
  async invalidate(props: { workspaceId: string }): Promise<void> {
    await this.invalidateCacheTags([
      "inbox-teams",
      `inbox-teams:${props.workspaceId}`,
    ])
  }
}

export const inboxTeamService = new InboxTeamService()
