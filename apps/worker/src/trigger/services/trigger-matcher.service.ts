import { db } from "@aha.chat/database/client"
import { Condition as ConditionEnum } from "@aha.chat/database/enums"
import type { ChatbotModel } from "@aha.chat/database/types"
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

    const triggers = await db.query.triggerModel.findMany({
      where: {
        chatbotId,
        active: true,
      },
      with: {
        conditions: true,
      },
    })

    // Filter triggers that have matching conditions
    const filteredTriggers = triggers.filter((trigger) =>
      trigger.conditions.some(
        (c) =>
          conditionTypes.includes(c.type) &&
          (sourceId ? c.sourceId === sourceId : true),
      ),
    )

    const chatbot = await db.query.chatbotModel.findFirst({
      where: {
        id: chatbotId,
      },
    })

    if (filteredTriggers.length === 0 || !chatbot) {
      return []
    }

    const evaluationPromises = filteredTriggers.map(async (trigger) => {
      const isMatch = await this.evaluateTriggerConditions(
        trigger,
        eventData,
        chatbot,
      )
      return isMatch ? trigger : null
    })

    const results = await Promise.all(evaluationPromises)

    return results.filter((t): t is TriggerWithConditions => t !== null)
  }

  private async evaluateTriggerConditions(
    trigger: TriggerWithConditions,
    eventData: TriggerEventData,
    chatbot: ChatbotModel,
  ): Promise<boolean> {
    const { conditions } = trigger

    if (conditions.length === 0) {
      return false
    }

    for (const condition of conditions) {
      if (eventData.eventType !== condition.type) {
        continue
      }

      const isMatch = await this.conditionEvaluator.evaluate({
        condition,
        eventData,
        chatbotId: trigger.chatbotId,
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
