import { db } from "@chatbotx.io/database/client"
import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { logger } from "../../lib/logger"
import { ConditionEvaluator } from "../../trigger/services/condition-evaluator"
import type { WebhookEventData, WebhookWithConditions } from "../types"
import { WebhookExecutor } from "./webhook-executor.service"

export class WebhookMatcherService {
  private readonly conditionEvaluator: ConditionEvaluator
  private readonly webhookExecutor: WebhookExecutor

  constructor() {
    this.conditionEvaluator = new ConditionEvaluator()
    this.webhookExecutor = new WebhookExecutor()
  }

  async findAndExecuteWebhooks(eventData: WebhookEventData): Promise<void> {
    const { workspaceId, eventType, eventData: metadata } = eventData

    const conditionTypes = this.mapEventTypeToConditionTypes(eventType)
    if (conditionTypes.length === 0) {
      return
    }

    const sourceId = metadata.sourceId as string | undefined

    const webhooks = await db.query.webhookModel.findMany({
      where: {
        workspaceId,
        active: true,
      },
      with: {
        conditions: true,
      },
    })

    // Filter webhooks that have matching conditions
    const filteredWebhooks = webhooks.filter((webhook) =>
      webhook.conditions.some(
        (c) =>
          conditionTypes.includes(c.type) &&
          (sourceId ? c.sourceId === sourceId : true),
      ),
    )

    if (filteredWebhooks.length === 0) {
      return
    }

    const workspace = await db.query.workspaceModel.findFirst({
      where: {
        id: workspaceId,
      },
    })

    if (!workspace) {
      return
    }

    for (const webhook of filteredWebhooks) {
      const isMatch = await this.evaluateWebhookConditions(
        webhook,
        eventData,
        workspace,
      )

      if (isMatch) {
        try {
          await this.webhookExecutor.execute({
            webhook,
            eventData,
          })
        } catch (error) {
          logger.error(
            error,
            `Failed to execute webhook ${webhook.id} for workspace ${workspaceId}`,
          )
        }
      }
    }
  }

  private async evaluateWebhookConditions(
    webhook: WebhookWithConditions,
    eventData: WebhookEventData,
    workspace: WorkspaceModel,
  ): Promise<boolean> {
    const { conditions } = webhook

    if (conditions.length === 0) {
      return false
    }

    for (const condition of conditions) {
      const isMatch = await this.conditionEvaluator.evaluate({
        condition,
        eventData: {
          workspaceId: webhook.workspaceId,
          contactId: eventData.contactId,
          eventType: eventData.eventType,
          eventData: eventData.eventData,
          timestamp: eventData.timestamp,
        },
        workspaceId: webhook.workspaceId,
        contactId: eventData.contactId,
        workspace,
      })

      if (isMatch) {
        return true
      }
    }

    return false
  }

  private mapEventTypeToConditionTypes(eventType: string): string[] {
    const mapping: Record<string, string[]> = {
      [triggerEventTypes.enum.tagApplied]: [triggerEventTypes.enum.tagApplied],
      [triggerEventTypes.enum.tagRemoved]: [triggerEventTypes.enum.tagRemoved],
      [triggerEventTypes.enum.customFieldValueChanged]: [
        triggerEventTypes.enum.customFieldValueChanged,
      ],
      [triggerEventTypes.enum.conversationTransferredToHuman]: [
        triggerEventTypes.enum.conversationTransferredToHuman,
      ],
      [triggerEventTypes.enum.conversationTransferredToBot]: [
        triggerEventTypes.enum.conversationTransferredToBot,
      ],
      [triggerEventTypes.enum.newContact]: [triggerEventTypes.enum.newContact],
      [triggerEventTypes.enum.contactUnsubscribedFormBroadcast]: [
        triggerEventTypes.enum.contactUnsubscribedFormBroadcast,
      ],
      [triggerEventTypes.enum.archived]: [triggerEventTypes.enum.archived],
      [triggerEventTypes.enum.followUp]: [triggerEventTypes.enum.followUp],
      [triggerEventTypes.enum.conversationAssigned]: [
        triggerEventTypes.enum.conversationAssigned,
      ],
      [triggerEventTypes.enum.conversationUnassigned]: [
        triggerEventTypes.enum.conversationUnassigned,
      ],
      [triggerEventTypes.enum.subscribedToSequence]: [
        triggerEventTypes.enum.subscribedToSequence,
      ],
      [triggerEventTypes.enum.unsubscribedFromSequence]: [
        triggerEventTypes.enum.unsubscribedFromSequence,
      ],
    }

    return mapping[eventType] || []
  }
}
