import { triggerService } from "@chatbotx.io/business"
import { setTriggerExecutionContext } from "@chatbotx.io/events"
import { logger } from "../../lib/logger"
import type { TriggerExecutionInput, TriggerWithConditions } from "../types"
import { ActionExecutor } from "./action-executor"

export class TriggerExecutorService {
  private readonly actionExecutor: ActionExecutor

  constructor() {
    this.actionExecutor = new ActionExecutor()
  }

  async execute(
    trigger: TriggerWithConditions,
    input: TriggerExecutionInput,
  ): Promise<void> {
    const { id: triggerId, workspaceId, actions } = trigger
    const { contactId, contactInboxId } = input

    try {
      setTriggerExecutionContext({ source: "worker" })

      const actionsArray = Array.isArray(actions) ? actions : []

      for (const action of actionsArray) {
        try {
          await this.actionExecutor.execute({
            action: action as Record<string, unknown>,
            contactId,
            triggerId,
            workspaceId,
            contactInboxId,
          })
        } catch (err) {
          logger.error(
            err,
            `Failed to execute action for trigger ${triggerId} for contact ${contactId}`,
          )
        }
      }

      await triggerService.recordContactHistory({
        triggerId,
        contactId,
        workspaceId,
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

    await triggerService.incrementStats({
      triggerId,
      workspaceId,
      date: today,
      success,
    })
  }
}
