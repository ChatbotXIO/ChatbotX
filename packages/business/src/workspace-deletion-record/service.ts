import type { DatabaseClient } from "@chatbotx.io/database/client"
import { workspaceDeletionRecordRepository } from "@chatbotx.io/database/repositories/workspace-deletion-record"
import {
  type WorkspaceDeletionRecordUsageSnapshot,
  workspaceDeletionRecordDetailsSchema,
  workspaceDeletionRecordUsageSnapshotSchema,
} from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

const toIso = (value: Date): string => value.toISOString()

class WorkspaceDeletionRecordService extends BaseService {
  async recordForWorkspace(input: {
    workspace: { id: string; ownerId: string; tenantId: string }
    tx?: DatabaseClient
  }): Promise<
    | { created: boolean; usageSnapshot: WorkspaceDeletionRecordUsageSnapshot }
    | undefined
  > {
    const sources = await workspaceDeletionRecordRepository.readSnapshotSources(
      {
        ownerId: input.workspace.ownerId,
        workspaceId: input.workspace.id,
      },
      input.tx,
    )
    if (!sources) {
      return
    }

    const usageSnapshot = workspaceDeletionRecordUsageSnapshotSchema.parse({
      botMessages: sources.botMessages.map((usage) => ({
        count: usage.count,
        periodEnd: toIso(usage.periodEnd),
        periodStart: toIso(usage.periodStart),
      })),
      channels: sources.inboxes.length,
      contacts: sources.contacts,
      mac: sources.mac.map((usage) => ({
        count: usage.count,
        periodEnd: toIso(usage.periodEnd),
        periodStart: toIso(usage.periodStart),
      })),
      ownerQuota: sources.quota
        ? {
            botMessagesUsed: sources.quota.botMessagesUsed,
            macUsed: sources.quota.macUsed,
            monthlyBotMessagesUsed: sources.quota.monthlyBotMessagesUsed,
            periodEnd: sources.quota.periodEnd
              ? toIso(sources.quota.periodEnd)
              : null,
            periodStart: sources.quota.periodStart
              ? toIso(sources.quota.periodStart)
              : null,
            planName: sources.quota.planName,
            planStatus: sources.quota.planStatus,
          }
        : null,
      teamMembers: sources.members.length,
    })
    const details = workspaceDeletionRecordDetailsSchema.parse({
      channels: sources.inboxes,
      members: sources.members,
      owner: sources.owner
        ? { ...sources.owner, id: input.workspace.ownerId }
        : {
            email: null,
            id: input.workspace.ownerId,
            name: null,
            tenantId: null,
          },
      plan: sources.quota
        ? {
            periodEnd: sources.quota.periodEnd
              ? toIso(sources.quota.periodEnd)
              : null,
            periodStart: sources.quota.periodStart
              ? toIso(sources.quota.periodStart)
              : null,
            planName: sources.quota.planName,
            planStatus: sources.quota.planStatus,
          }
        : null,
      requestedBy: sources.requestedBy
        ? {
            ...sources.requestedBy,
            id: sources.workspace.deletionRequestedById,
            via: "ui" as const,
          }
        : null,
      workspace: {
        createdAt: toIso(sources.workspace.createdAt),
        id: sources.workspace.id,
        language: sources.workspace.language,
        logo: sources.workspace.logo,
        name: sources.workspace.name,
        timezone: sources.workspace.timezone,
      },
    })
    const created = await workspaceDeletionRecordRepository.insertIfAbsent(
      {
        deletionRequestedAt: sources.workspace.deletionRequestedAt,
        deletionRequestedByEmail: sources.requestedBy?.email ?? null,
        deletionRequestedById: sources.workspace.deletionRequestedById,
        details,
        ownerEmail: sources.owner?.email ?? null,
        ownerId: input.workspace.ownerId,
        scheduledDeletionAt: sources.workspace.scheduledDeletionAt,
        tenantId: input.workspace.tenantId,
        usageSnapshot,
        workspaceId: input.workspace.id,
        workspaceName: sources.workspace.name,
      },
      input.tx,
    )
    return { created, usageSnapshot }
  }

  async markPurged(input: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<void> {
    await workspaceDeletionRecordRepository.markPurged(
      input.workspaceId,
      input.tx,
    )
  }

  async listForOwner(input: {
    ownerId: string
    page: number
    perPage: number
  }) {
    const result = await workspaceDeletionRecordRepository.listForOwner({
      ownerId: input.ownerId,
      limit: input.perPage,
      offset: (input.page - 1) * input.perPage,
    })
    return {
      data: result.data,
      pageCount: Math.ceil(result.total / input.perPage),
    }
  }

  async listForAdmin(input: {
    page: number
    perPage: number
    search?: string
    tenantId?: string
  }) {
    const result = await workspaceDeletionRecordRepository.listForAdmin({
      limit: input.perPage,
      offset: (input.page - 1) * input.perPage,
      search: input.search,
      tenantId: input.tenantId,
    })
    return {
      data: result.data,
      pageCount: Math.ceil(result.total / input.perPage),
    }
  }
}

export const workspaceDeletionRecordService =
  new WorkspaceDeletionRecordService()
