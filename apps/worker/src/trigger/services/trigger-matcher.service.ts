import { db } from "@chatbotx.io/database/client"
import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
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
    const { workspaceId, eventType, eventData: metadata } = eventData

    const conditionTypes = this.mapEventTypeToConditionTypes(eventType)
    if (conditionTypes.length === 0) {
      return []
    }

    const sourceId = metadata.sourceId as string | undefined

    const triggers = await db.query.triggerModel.findMany({
      where: {
        workspaceId,
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

    const workspace = await db.query.workspaceModel.findFirst({
      where: {
        id: workspaceId,
      },
    })

    if (filteredTriggers.length === 0 || !workspace) {
      return []
    }

    const evaluationPromises = filteredTriggers.map(async (trigger) => {
      const isMatch = await this.evaluateTriggerConditions(
        trigger,
        eventData,
        workspace,
      )
      return isMatch ? trigger : null
    })

    const results = await Promise.all(evaluationPromises)

    return results.filter((t): t is TriggerWithConditions => t !== null)
  }

  private async evaluateTriggerConditions(
    trigger: TriggerWithConditions,
    eventData: TriggerEventData,
    workspace: WorkspaceModel,
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
        workspaceId: trigger.workspaceId,
        contactId: eventData.contactId,
        workspace,
      })

      if (!isMatch) {
        return false
      }
    }

    return true
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
