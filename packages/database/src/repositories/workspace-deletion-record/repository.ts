import {
  and,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  or,
  type SQL,
  sql,
} from "../../client"
import {
  contactModel,
  inboxModel,
  userModel,
  workspaceBotMessageUsageModel,
  workspaceDeletionRecordModel,
  workspaceMacModel,
  workspaceMemberModel,
} from "../../schema"
import type {
  WorkspaceDeletionRecordDetails,
  WorkspaceDeletionRecordUsageSnapshot,
} from "../../schema/workspace-deletion-record"

type CreateInput = {
  deletionRequestedAt: Date | null
  deletionRequestedByEmail: string | null
  deletionRequestedById: string | null
  details: WorkspaceDeletionRecordDetails
  ownerEmail: string | null
  ownerId: string
  scheduledDeletionAt: Date | null
  tenantId: string
  usageSnapshot: WorkspaceDeletionRecordUsageSnapshot
  workspaceId: string
  workspaceName: string
}

class WorkspaceDeletionRecordRepository {
  async readSnapshotSources(
    input: { ownerId: string; workspaceId: string },
    client: DatabaseClient = db,
  ) {
    const workspace = await client.query.workspaceModel.findFirst({
      where: { id: input.workspaceId },
    })
    if (!workspace) {
      return
    }

    const [
      owner,
      requestedBy,
      members,
      inboxes,
      mac,
      botMessages,
      contacts,
      quota,
    ] = await Promise.all([
      client.query.userModel.findFirst({
        where: { id: input.ownerId },
        columns: { email: true, name: true, tenantId: true },
      }),
      workspace.deletionRequestedById
        ? client.query.userModel.findFirst({
            where: { id: workspace.deletionRequestedById },
            columns: { email: true, name: true },
          })
        : undefined,
      client
        .select({
          email: userModel.email,
          name: userModel.name,
          role: workspaceMemberModel.role,
          userId: workspaceMemberModel.userId,
        })
        .from(workspaceMemberModel)
        .innerJoin(userModel, eq(workspaceMemberModel.userId, userModel.id))
        .where(eq(workspaceMemberModel.workspaceId, input.workspaceId)),
      client
        .select({
          channel: inboxModel.channel,
          id: inboxModel.id,
          name: inboxModel.name,
          status: inboxModel.status,
        })
        .from(inboxModel)
        .where(eq(inboxModel.workspaceId, input.workspaceId)),
      client
        .select({
          count: workspaceMacModel.macCount,
          periodEnd: workspaceMacModel.periodEnd,
          periodStart: workspaceMacModel.periodStart,
        })
        .from(workspaceMacModel)
        .where(eq(workspaceMacModel.workspaceId, input.workspaceId)),
      client
        .select({
          count: workspaceBotMessageUsageModel.count,
          periodEnd: workspaceBotMessageUsageModel.periodEnd,
          periodStart: workspaceBotMessageUsageModel.periodStart,
        })
        .from(workspaceBotMessageUsageModel)
        .where(
          eq(workspaceBotMessageUsageModel.workspaceId, input.workspaceId),
        ),
      client.$count(
        contactModel,
        eq(contactModel.workspaceId, input.workspaceId),
      ),
      client.query.userQuotaModel.findFirst({
        where: { userId: input.ownerId },
        columns: {
          botMessagesUsed: true,
          macUsed: true,
          monthlyBotMessagesUsed: true,
          periodEnd: true,
          periodStart: true,
          planName: true,
          planStatus: true,
        },
      }),
    ])

    return {
      botMessages,
      contacts,
      inboxes,
      mac,
      members,
      owner,
      quota,
      requestedBy,
      workspace,
    }
  }

  async insertIfAbsent(
    input: CreateInput,
    client: DatabaseClient = db,
  ): Promise<boolean> {
    const [record] = await client
      .insert(workspaceDeletionRecordModel)
      .values(input)
      .onConflictDoNothing()
      .returning({ id: workspaceDeletionRecordModel.id })
    return Boolean(record)
  }

  async markPurged(
    workspaceId: string,
    client: DatabaseClient = db,
  ): Promise<void> {
    await client
      .update(workspaceDeletionRecordModel)
      .set({ purgedAt: new Date() })
      .where(eq(workspaceDeletionRecordModel.workspaceId, workspaceId))
  }

  async listForOwner(input: {
    ownerId: string
    limit: number
    offset: number
  }) {
    const where = eq(workspaceDeletionRecordModel.ownerId, input.ownerId)
    const [data, total] = await Promise.all([
      db
        .select()
        .from(workspaceDeletionRecordModel)
        .where(where)
        .orderBy(desc(workspaceDeletionRecordModel.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      db
        .select({ value: count() })
        .from(workspaceDeletionRecordModel)
        .where(where),
    ])
    return { data, total: total[0]?.value ?? 0 }
  }

  async listForAdmin(input: {
    limit: number
    offset: number
    search?: string
    tenantId?: string
  }) {
    const conditions: SQL[] = [sql`TRUE`]
    if (input.tenantId) {
      conditions.push(eq(workspaceDeletionRecordModel.tenantId, input.tenantId))
    }
    if (input.search) {
      const pattern = `%${input.search}%`
      const searchCondition = or(
        ilike(workspaceDeletionRecordModel.workspaceName, pattern),
        ilike(workspaceDeletionRecordModel.ownerEmail, pattern),
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }
    const where = and(...conditions)
    const [data, total] = await Promise.all([
      db
        .select()
        .from(workspaceDeletionRecordModel)
        .where(where)
        .orderBy(desc(workspaceDeletionRecordModel.createdAt))
        .limit(input.limit)
        .offset(input.offset),
      db
        .select({ value: count() })
        .from(workspaceDeletionRecordModel)
        .where(where),
    ])
    return { data, total: total[0]?.value ?? 0 }
  }
}

export const workspaceDeletionRecordRepository =
  new WorkspaceDeletionRecordRepository()
