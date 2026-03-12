import { db, sql } from "@aha.chat/database/client"
import {
  triggerContactHistoryModel,
  triggerStatsModel,
} from "@aha.chat/database/schema"
import { setTriggerExecutionContext } from "@aha.chat/events/context"
import { createId } from "@paralleldrive/cuid2"
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
    const { id: triggerId, chatbotId, actions } = trigger

    try {
      setTriggerExecutionContext({ source: "worker" })

      const actionsArray = Array.isArray(actions) ? actions : []

      for (const action of actionsArray) {
        try {
          await this.actionExecutor.execute({
            action: action as Record<string, unknown>,
            contactId,
            chatbotId,
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
        chatbotId,
        firstEnteredAt: new Date(),
      })

      await this.updateStats(triggerId, chatbotId, true)

      logger.info(
        `Successfully executed trigger ${triggerId} for contact ${contactId}`,
      )
    } catch (error) {
      logger.error(
        error,
        `Failed to execute trigger ${triggerId} for contact ${contactId}`,
      )

      await this.updateStats(triggerId, chatbotId, false)

      throw error
    }
  }

  private async updateStats(
    triggerId: string,
    chatbotId: string,
    success: boolean,
  ): Promise<void> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    await db
      .insert(triggerStatsModel)
      .values({
        id: createId(),
        triggerId,
        chatbotId,
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
