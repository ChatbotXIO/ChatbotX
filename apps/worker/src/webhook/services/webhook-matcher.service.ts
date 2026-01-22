import { prisma } from "@aha.chat/database"
import { Condition as ConditionEnum } from "@aha.chat/database/enums"
import type { ChatbotModel } from "@aha.chat/database/types"
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
    const { chatbotId, eventType, eventData: metadata } = eventData

    const conditionTypes = this.mapEventTypeToConditionTypes(eventType)
    if (conditionTypes.length === 0) {
      return
    }

    const sourceId = metadata.sourceId as string | undefined

    const webhooks = await prisma.webhook.findMany({
      where: {
        chatbotId,
        active: true,
        conditions: {
          some: {
            type: { in: conditionTypes },
            ...(sourceId ? { sourceId } : {}),
          },
        },
      },
      include: {
        conditions: true,
      },
    })

    if (webhooks.length === 0) {
      return
    }

    const chatbot = await prisma.chatbot.findUnique({
      where: {
        id: chatbotId,
      },
    })

    if (!chatbot) {
      return
    }

    for (const webhook of webhooks) {
      const isMatch = await this.evaluateWebhookConditions(
        webhook,
        eventData,
        chatbot,
      )

      if (isMatch) {
        try {
          await this.webhookExecutor.execute({
            webhook,
            eventData,
          })
        } catch (error) {
          logger.error(
            `Failed to execute webhook ${webhook.id} for chatbot ${chatbotId}`,
            error,
          )
        }
      }
    }
  }

  private async evaluateWebhookConditions(
    webhook: WebhookWithConditions,
    eventData: WebhookEventData,
    chatbot: ChatbotModel,
  ): Promise<boolean> {
    const { conditions } = webhook

    if (conditions.length === 0) {
      return false
    }

    for (const condition of conditions) {
      const isMatch = await this.conditionEvaluator.evaluate({
        condition,
        eventData: {
          chatbotId: webhook.chatbotId,
          contactId: eventData.contactId,
          eventType: eventData.eventType,
          eventData: eventData.eventData,
          timestamp: eventData.timestamp,
        },
        chatbotId: webhook.chatbotId,
        contactId: eventData.contactId,
        chatbot,
      })

      if (!isMatch) {
        return false
      }
    }

    return true
  }

  private mapEventTypeToConditionTypes(eventType: number): number[] {
    const mapping: Record<number, number[]> = {
      [ConditionEnum.tagApplied]: [ConditionEnum.tagApplied],
      [ConditionEnum.tagRemoved]: [ConditionEnum.tagRemoved],
      [ConditionEnum.customFieldValueChanged]: [
        ConditionEnum.customFieldValueChanged,
      ],
      [ConditionEnum.conversationTransferredToHuman]: [
        ConditionEnum.conversationTransferredToHuman,
      ],
      [ConditionEnum.conversationTransferredToBot]: [
        ConditionEnum.conversationTransferredToBot,
      ],
      [ConditionEnum.newContact]: [ConditionEnum.newContact],
      [ConditionEnum.contactUnsubscribedFormBroadcast]: [
        ConditionEnum.contactUnsubscribedFormBroadcast,
      ],
      [ConditionEnum.archived]: [ConditionEnum.archived],
      [ConditionEnum.followUp]: [ConditionEnum.followUp],
      [ConditionEnum.conversationAssigned]: [
        ConditionEnum.conversationAssigned,
      ],
      [ConditionEnum.conversationUnassigned]: [
        ConditionEnum.conversationUnassigned,
      ],
      [ConditionEnum.subscribedToSequence]: [
        ConditionEnum.subscribedToSequence,
      ],
      [ConditionEnum.unsubscribedFromSequence]: [
        ConditionEnum.unsubscribedFromSequence,
      ],
    }

    return mapping[eventType] || []
  }
}
