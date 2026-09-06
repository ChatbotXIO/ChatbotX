import { and, db, eq, inArray, sql } from "@chatbotx.io/database/client"
import {
  triggerContactHistoryModel,
  triggerExecutionModel,
  triggerModel,
  triggerStatsModel,
} from "@chatbotx.io/database/schema"
import type { ConditionModel, TriggerModel } from "@chatbotx.io/database/types"
import { removeTriggerCache } from "@chatbotx.io/events"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { assertDeletable } from "../template/installed-resource.service"

/** `trigger-matcher.service.ts` shape: an active trigger with its conditions. */
export type TriggerWithConditions = TriggerModel & {
  conditions: ConditionModel[]
}

/** `datetime-trigger-evaluator.ts` fetchTriggerChunk page shape. */
export type ActiveTriggerWithConditionsPageRow = TriggerModel & {
  conditions: ConditionModel[]
  workspace: { timezone: string | null } | null
}

class TriggerService extends BaseService {
  async listByWorkspaceId(workspaceId: string): Promise<TriggerModel[]> {
    return await db
      .select()
      .from(triggerModel)
      .where(eq(triggerModel.workspaceId, workspaceId))
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "trigger",
      resourceIds: input.ids,
    })

    const deletedTriggers = await db.query.triggerModel.findMany({
      where: { workspaceId: input.workspaceId, id: { in: input.ids } },
      columns: { id: true },
    })

    await db
      .delete(triggerModel)
      .where(
        and(
          eq(triggerModel.workspaceId, input.workspaceId),
          inArray(triggerModel.id, input.ids),
        ),
      )

    await removeTriggerCache(input.workspaceId)

    if (deletedTriggers.length > 0) {
      await this.audit(
        "delete",
        `deleted trigger${deletedTriggers.length > 1 ? "s" : ""} (${deletedTriggers.map((trigger) => `#${trigger.id}`).join(", ")})`,
      )
    }
  }

  /** `trigger-matcher.service.ts` findMatchingTriggers: every active trigger in a workspace, with conditions. */
  async listActiveWithConditions(input: {
    workspaceId: string
  }): Promise<TriggerWithConditions[]> {
    return (await db.query.triggerModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        active: true,
      },
      with: {
        conditions: true,
      },
    })) as TriggerWithConditions[]
  }

  /**
   * `datetime-trigger-evaluator.ts` fetchTriggerChunk page: every active
   * trigger (with its conditions and workspace timezone), keyset-paginated
   * by id. The datetime-condition filtering the handler applies afterward
   * stays in the handler — this only returns the raw page.
   */
  async listActiveWithConditionsPage(input: {
    cursor?: string
    limit: number
  }): Promise<{
    triggers: ActiveTriggerWithConditionsPageRow[]
    nextCursor: string | undefined
  }> {
    const triggers = (await db.query.triggerModel.findMany({
      where: {
        active: true,
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      with: {
        conditions: true,
        workspace: true,
      },
      limit: input.limit,
      orderBy: { id: "asc" },
    })) as ActiveTriggerWithConditionsPageRow[]

    return {
      triggers,
      nextCursor:
        triggers.length === input.limit ? triggers.at(-1)?.id : undefined,
    }
  }

  /** `datetime-trigger-evaluator.ts` getExecutedTriggers: existing (triggerId, contactId) execution pairs. */
  async listExecutedPairs(input: {
    triggerIds: string[]
    contactIds: string[]
  }): Promise<{ triggerId: string; contactId: string }[]> {
    if (input.triggerIds.length === 0 || input.contactIds.length === 0) {
      return []
    }
    return await db.query.triggerExecutionModel.findMany({
      where: {
        triggerId: { in: input.triggerIds },
        contactId: { in: input.contactIds },
      },
      columns: {
        triggerId: true,
        contactId: true,
      },
    })
  }

  /** `datetime-trigger-evaluator.ts` markTriggerExecuted: records a one-shot datetime execution. */
  async recordExecution(input: {
    triggerId: string
    contactId: string
    workspaceId: string
  }): Promise<void> {
    await db
      .insert(triggerExecutionModel)
      .values({
        id: createId(),
        triggerId: input.triggerId,
        contactId: input.contactId,
        workspaceId: input.workspaceId,
        createdAt: new Date(),
        executedAt: new Date(),
      })
      .onConflictDoNothing()
  }

  /** `datetime-trigger-evaluator.ts` cleanupOldExecutions: purge executions older than the cutoff. */
  async purgeExecutionsOlderThan(cutoff: Date): Promise<number> {
    const result = await db.execute(
      sql`DELETE FROM "TriggerExecution" WHERE "executedAt" < ${cutoff}`,
    )
    return Number(result.rowCount ?? 0)
  }

  /** `trigger-executor.service.ts` execute: records first-entered contact history. */
  async recordContactHistory(input: {
    triggerId: string
    contactId: string
    workspaceId: string
  }): Promise<void> {
    await db.insert(triggerContactHistoryModel).values({
      id: createId(),
      triggerId: input.triggerId,
      contactId: input.contactId,
      workspaceId: input.workspaceId,
      firstEnteredAt: new Date(),
    })
  }

  /**
   * `trigger-executor.service.ts` updateStats: daily per-trigger stats
   * upsert. `+1` expressions and the conditional success/failure increment
   * are moved verbatim; the date normalisation (`setHours(0,0,0,0)`) is the
   * caller's responsibility.
   */
  async incrementStats(input: {
    triggerId: string
    workspaceId: string
    date: Date
    success: boolean
  }): Promise<void> {
    const { triggerId, workspaceId, date, success } = input
    await db
      .insert(triggerStatsModel)
      .values({
        id: createId(),
        triggerId,
        workspaceId,
        date,
        totalContacts: 1,
        totalExecutions: 1,
        successCount: success ? 1 : 0,
        failureCount: success ? 0 : 1,
      })
      .onConflictDoUpdate({
        target: [triggerStatsModel.triggerId, triggerStatsModel.date],
        set: {
          totalContacts: sql`${triggerStatsModel.totalContacts} + 1`,
          totalExecutions: sql`${triggerStatsModel.totalExecutions} + 1`,
          successCount: success
            ? sql`${triggerStatsModel.successCount} + 1`
            : triggerStatsModel.successCount,
          failureCount: success
            ? triggerStatsModel.failureCount
            : sql`${triggerStatsModel.failureCount} + 1`,
        },
      })
  }
}

export const triggerService = new TriggerService()
