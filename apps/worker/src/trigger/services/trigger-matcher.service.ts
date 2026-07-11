import { workspaceService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { TriggerEventType } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { matchableConditionTypesFor } from "@chatbotx.io/events"
import type { TriggerEventData, TriggerWithConditions } from "../types"
import { ConditionEvaluator } from "./condition-evaluator"

function hasConditionType(
  conditionTypes: readonly TriggerEventType[],
  conditionType: string,
): boolean {
  return conditionTypes.some((type) => type === conditionType)
}

export class TriggerMatcherService {
  private readonly conditionEvaluator: ConditionEvaluator

  constructor() {
    this.conditionEvaluator = new ConditionEvaluator()
  }

  async findMatchingTriggers(
    eventData: TriggerEventData,
  ): Promise<TriggerWithConditions[]> {
    const { workspaceId, eventType, eventData: metadata } = eventData

    const conditionTypes = matchableConditionTypesFor(eventType)
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
          hasConditionType(conditionTypes, c.type) &&
          (sourceId ? c.sourceId === sourceId : true),
      ),
    )

    const workspace = await workspaceService.find({
      where: { id: workspaceId },
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
}
