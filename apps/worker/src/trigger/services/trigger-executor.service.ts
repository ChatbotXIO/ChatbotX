import { triggerService } from "@chatbotx.io/business"
import { setTriggerExecutionContext } from "@chatbotx.io/events"
import { logger } from "../../lib/logger"
import type { TriggerExecutionInput, TriggerWithConditions } from "../types"
import { ActionExecutor } from "./action-executor"
import { createTriggerActionScope } from "./actions/scope"

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
    const { contactId, contactInboxId, decisionFlowOrigin, occurrenceId } =
      input
    const runAllowed = await triggerService.tryAcquireContactRun({
      workspaceId,
      triggerId,
      contactId,
    })
    if (!runAllowed) {
      return
    }

    try {
      setTriggerExecutionContext({ source: "worker" })

      const actionsArray = Array.isArray(actions) ? actions : []
      const scope = createTriggerActionScope({
        contactId,
        workspaceId,
        contactInboxId,
      })

      for (const [index, action] of actionsArray.entries()) {
        try {
          await this.actionExecutor.execute(
            {
              action: action as Record<string, unknown>,
              contactId,
              source: { kind: "trigger", triggerId },
              workspaceId,
              contactInboxId,
              decisionFlowOrigin,
              occurrenceKey: occurrenceId
                ? `trigger:${occurrenceId}:${triggerId}:${index}`
                : undefined,
            },
            scope,
          )
        } catch (err) {
          logger.error(
            err,
            `Failed to execute action for trigger ${triggerId} for contact ${contactId}`,
          )
        }
      }

      await this.recordRun(triggerId, contactId, workspaceId)
    } catch (error) {
      logger.error(
        error,
        `Failed to execute trigger ${triggerId} for contact ${contactId}`,
      )

      await this.updateStats(triggerId, workspaceId, false)

      throw error
    }
  }

  /**
   * Runs after the actions: a failure here must not rethrow, or BullMQ retries
   * the job and every (mostly non-idempotent) action runs a second time.
   */
  private async recordRun(
    triggerId: string,
    contactId: string,
    workspaceId: string,
  ): Promise<void> {
    try {
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
        `Trigger ${triggerId} actions ran for contact ${contactId} but bookkeeping failed; not retrying`,
      )
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
