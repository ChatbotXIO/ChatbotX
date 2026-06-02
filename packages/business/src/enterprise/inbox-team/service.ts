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
    await db.transaction(async (tx) => {
      const inboxTeamId = createId()
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
  }

  async delete(props: { workspaceId: string; ids: string[] }): Promise<void> {
    const { workspaceId, ids } = props
    await db
      .delete(inboxTeamModel)
      .where(
        and(
          eq(inboxTeamModel.workspaceId, workspaceId),
          inArray(inboxTeamModel.id, ids),
        ),
      )
    await this.invalidate({ workspaceId })
  }

  async addMembers(
    ctx: { workspaceId: string; inboxTeamId: string },
    userIds: string[],
  ): Promise<void> {
    const team = await this.findByIdOrFail(ctx)
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
      }
    })
    await this.invalidate({ workspaceId: ctx.workspaceId })
  }

  async removeMembers(
    ctx: { workspaceId: string; inboxTeamId: string },
    memberIds: string[],
  ): Promise<void> {
    const team = await this.findByIdOrFail(ctx)
    await db
      .delete(inboxTeamMemberModel)
      .where(
        and(
          eq(inboxTeamMemberModel.inboxTeamId, team.id),
          inArray(inboxTeamMemberModel.id, memberIds),
        ),
      )
    await this.invalidate({ workspaceId: ctx.workspaceId })
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
