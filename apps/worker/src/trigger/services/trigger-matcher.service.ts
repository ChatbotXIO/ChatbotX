import { prisma } from "@aha.chat/database"
import { TriggerCondition as TriggerConditionEnum } from "@aha.chat/database/enums"
import type { TriggerEventData, TriggerWithConditions } from "../types"
import { ConditionEvaluator } from "./condition-evaluator"

export class TriggerMatcherService {
  private readonly conditionEvaluator: ConditionEvaluator

  constructor() {
    this.conditionEvaluator = new ConditionEvaluator()
  }

  async findMatchingTriggers(
    eventData: TriggerEventData,
  ): Promise<TriggerWithConditions[]> {
    const { chatbotId, eventType, eventData: metadata } = eventData

    const conditionTypes = this.mapEventTypeToConditionTypes(eventType)
    if (conditionTypes.length === 0) {
      return []
    }

    const sourceId = metadata.sourceId as string | undefined

    const triggers = await prisma.trigger.findMany({
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

    if (triggers.length === 0) {
      return []
    }

    const evaluationPromises = triggers.map(async (trigger) => {
      const isMatch = await this.evaluateTriggerConditions(trigger, eventData)
      return isMatch ? trigger : null
    })

    const results = await Promise.all(evaluationPromises)

    return results.filter((t): t is TriggerWithConditions => t !== null)
  }

  private async evaluateTriggerConditions(
    trigger: TriggerWithConditions,
    eventData: TriggerEventData,
  ): Promise<boolean> {
    const { conditions } = trigger

    if (conditions.length === 0) {
      return false
    }

    for (const condition of conditions) {
      const isMatch = await this.conditionEvaluator.evaluate({
        condition,
        eventData,
        chatbotId: trigger.chatbotId,
        contactId: eventData.contactId,
      })

      if (!isMatch) {
        return false
      }
    }

    return true
  }

  private mapEventTypeToConditionTypes(eventType: number): number[] {
    const mapping: Record<number, number[]> = {
      [TriggerConditionEnum.tagApplied]: [TriggerConditionEnum.tagApplied],
      [TriggerConditionEnum.tagRemoved]: [TriggerConditionEnum.tagRemoved],
      [TriggerConditionEnum.customFieldValueChanged]: [
        TriggerConditionEnum.customFieldValueChanged,
      ],
      [TriggerConditionEnum.conversationTransferredToHuman]: [
        TriggerConditionEnum.conversationTransferredToHuman,
      ],
      [TriggerConditionEnum.conversationTransferredToBot]: [
        TriggerConditionEnum.conversationTransferredToBot,
      ],
      [TriggerConditionEnum.newContact]: [TriggerConditionEnum.newContact],
      [TriggerConditionEnum.contactUnsubscribedFormBroadcast]: [
        TriggerConditionEnum.contactUnsubscribedFormBroadcast,
      ],
      [TriggerConditionEnum.archived]: [TriggerConditionEnum.archived],
      [TriggerConditionEnum.followUp]: [TriggerConditionEnum.followUp],
      [TriggerConditionEnum.conversationAssigned]: [
        TriggerConditionEnum.conversationAssigned,
      ],
      [TriggerConditionEnum.conversationUnassigned]: [
        TriggerConditionEnum.conversationUnassigned,
      ],
      [TriggerConditionEnum.subscribedToSequence]: [
        TriggerConditionEnum.subscribedToSequence,
      ],
      [TriggerConditionEnum.unsubscribedFromSequence]: [
        TriggerConditionEnum.unsubscribedFromSequence,
      ],
    }

    return mapping[eventType] || []
  }
}
