import { prisma } from "@aha.chat/database"
import { logger } from "../../lib/logger"
import type { TriggerWithConditions } from "../types"
import { ActionExecutor } from "./action-executor"

export class TriggerExecutorService {
  private readonly actionExecutor: ActionExecutor

  constructor() {
    this.actionExecutor = new ActionExecutor()
  }

  /**
   * Execute a trigger for a specific contact
   */
  async execute(
    trigger: TriggerWithConditions,
    contactId: string,
  ): Promise<void> {
    const { id: triggerId, chatbotId, actions } = trigger

    try {
      // Check if contact already triggered this (prevent duplicate execution)
      const existingHistory = await prisma.triggerContactHistory.findUnique({
        where: {
          triggerId_contactId: {
            triggerId,
            contactId,
          },
        },
      })

      if (existingHistory) {
        logger.info(
          `Trigger ${triggerId} already executed for contact ${contactId}`,
        )
        return
      }

      // Execute all actions
      const actionsArray = Array.isArray(actions) ? actions : []

      for (const action of actionsArray) {
        await this.actionExecutor.execute({
          action: action as Record<string, unknown>,
          contactId,
          chatbotId,
        })
      }

      // Save execution history
      await prisma.triggerContactHistory.create({
        data: {
          triggerId,
          contactId,
          chatbotId,
          firstEnteredAt: new Date(),
        },
      })

      // Update stats
      await this.updateStats(triggerId, chatbotId, true)

      logger.info(
        `Successfully executed trigger ${triggerId} for contact ${contactId}`,
      )
    } catch (error) {
      logger.error(
        `Failed to execute trigger ${triggerId} for contact ${contactId}`,
        error,
      )

      // Update stats with failure
      await this.updateStats(triggerId, chatbotId, false)

      throw error
    }
  }

  /**
   * Update trigger statistics
   */
  private async updateStats(
    triggerId: string,
    chatbotId: string,
    success: boolean,
  ): Promise<void> {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    await prisma.triggerStats.upsert({
      where: {
        triggerId_date: {
          triggerId,
          date: today,
        },
      },
      create: {
        triggerId,
        chatbotId,
        date: today,
        totalContacts: 1,
        totalExecutions: 1,
        successCount: success ? 1 : 0,
        failureCount: success ? 0 : 1,
      },
      update: {
        totalContacts: { increment: 1 },
        totalExecutions: { increment: 1 },
        successCount: success ? { increment: 1 } : undefined,
        failureCount: success ? undefined : { increment: 1 },
      },
    })
  }
}
