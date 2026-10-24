import { type DatabaseClient, db, eq } from "../../client"
import {
  contactModel,
  inboxModel,
  userModel,
  workspaceBotMessageUsageModel,
  workspaceDeletionRecordModel,
  workspaceMacModel,
  workspaceMemberModel,
} from "../../schema"
import {
  type WorkspaceDeletionRecordDetails,
  type WorkspaceDeletionRecordUsageSnapshot,
  workspaceDeletionRecordDetailsSchema,
  workspaceDeletionRecordUsageSnapshotSchema,
} from "../../schema/workspace-deletion-record"

class WorkspaceDeletionRecordRepository {
  async createForWorkspace(
    input: { ownerId: string; tenantId: string; workspaceId: string },
    client: DatabaseClient = db,
  ): Promise<
    | {
        created: boolean
        usageSnapshot: WorkspaceDeletionRecordUsageSnapshot
      }
    | undefined
  > {
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
      channels,
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
      client.$count(inboxModel, eq(inboxModel.workspaceId, input.workspaceId)),
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
    const usageSnapshot: WorkspaceDeletionRecordUsageSnapshot = {
      botMessages,
      channels,
      contacts,
      mac,
      ownerQuota: quota ?? null,
      teamMembers: members.length,
    }
    const details: WorkspaceDeletionRecordDetails = {
      channels: inboxes,
      members,
      owner: owner
        ? { ...owner, id: input.ownerId }
        : { email: null, id: input.ownerId, name: null, tenantId: null },
      plan: quota
        ? {
            periodEnd: quota.periodEnd,
            periodStart: quota.periodStart,
            planName: quota.planName,
            planStatus: quota.planStatus,
          }
        : null,
      requestedBy: requestedBy
        ? { ...requestedBy, id: workspace.deletionRequestedById, via: "ui" }
        : null,
      workspace: {
        createdAt: workspace.createdAt,
        id: workspace.id,
        language: workspace.language,
        logo: workspace.logo,
        name: workspace.name,
        timezone: workspace.timezone,
      },
    }
    const validatedUsageSnapshot =
      workspaceDeletionRecordUsageSnapshotSchema.parse(usageSnapshot)
    const validatedDetails = workspaceDeletionRecordDetailsSchema.parse(details)
    const [record] = await client
      .insert(workspaceDeletionRecordModel)
      .values({
        deletionRequestedAt: workspace.deletionRequestedAt,
        deletionRequestedByEmail: requestedBy?.email,
        deletionRequestedById: workspace.deletionRequestedById,
        details: validatedDetails,
        ownerEmail: owner?.email,
        ownerId: input.ownerId,
        scheduledDeletionAt: workspace.scheduledDeletionAt,
        tenantId: input.tenantId,
        usageSnapshot: validatedUsageSnapshot,
        workspaceId: input.workspaceId,
        workspaceName: workspace.name,
      })
      .onConflictDoNothing()
      .returning({ id: workspaceDeletionRecordModel.id })
    return { created: Boolean(record), usageSnapshot: validatedUsageSnapshot }
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
}

export const workspaceDeletionRecordRepository =
  new WorkspaceDeletionRecordRepository()
