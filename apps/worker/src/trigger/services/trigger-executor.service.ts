import { setTriggerExecutionContext } from "@chatbotx/events"
import { db, sql } from "@chatbotx.io/database/client"
import {
  triggerContactHistoryModel,
  triggerStatsModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { logger } from "../../lib/logger"
import type { TriggerWithConditions } from "../types"
import { ActionExecutor } from "./action-executor"

export class TriggerExecutorService {
  private readonly actionExecutor: ActionExecutor

  constructor() {
    this.actionExecutor = new ActionExecutor()
  }

  async execute(
    trigger: TriggerWithConditions,
    contactId: string,
  ): Promise<void> {
    const { id: triggerId, workspaceId, actions } = trigger

    try {
      setTriggerExecutionContext({ source: "worker" })

      const actionsArray = Array.isArray(actions) ? actions : []

      for (const action of actionsArray) {
        try {
          await this.actionExecutor.execute({
            action: action as Record<string, unknown>,
            contactId,
            workspaceId,
          })
        } catch (err) {
          logger.error(
            err,
            `Failed to execute action for trigger ${triggerId} for contact ${contactId}`,
          )
        }
      }

      await db.insert(triggerContactHistoryModel).values({
        id: createId(),
        triggerId,
        contactId,
        workspaceId,
        firstEnteredAt: new Date(),
      })

      await this.updateStats(triggerId, workspaceId, true)

      logger.info(
        `Successfully executed trigger ${triggerId} for contact ${contactId}`,
      )
    } catch (error) {
      logger.error(
        error,
        `Failed to execute trigger ${triggerId} for contact ${contactId}`,
      )

      await this.updateStats(triggerId, workspaceId, false)

      throw error
    }
  }

  private async updateStats(
    triggerId: string,
    workspaceId: string,
    success: boolean,
  ): Promise<void> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    await db
      .insert(triggerStatsModel)
      .values({
        id: createId(),
        triggerId,
        workspaceId,
        date: today,
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
