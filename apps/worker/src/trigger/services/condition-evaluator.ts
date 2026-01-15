import { prisma } from "@aha.chat/database"
import { TriggerCondition as TriggerConditionEnum } from "@aha.chat/database/enums"
import type { ChatbotModel } from "@aha.chat/database/types"
import type { ConditionEvaluationContext } from "../types"

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class ConditionEvaluator {
  async evaluate(context: ConditionEvaluationContext): Promise<boolean> {
    const { condition, eventData, chatbotId, contactId, chatbot } = context
    const { type, sourceId, operator, value } = condition

    switch (type) {
      case TriggerConditionEnum.tagApplied:
      case TriggerConditionEnum.tagRemoved:
        return this.evaluateTagCondition(
          type,
          sourceId,
          eventData.eventData.tagId as string,
        )

      case TriggerConditionEnum.customFieldValueChanged:
        return this.evaluateCustomFieldCondition(
          sourceId,
          operator,
          value,
          eventData.eventData,
        )

      case TriggerConditionEnum.conversationTransferredToHuman:
      case TriggerConditionEnum.conversationTransferredToBot:
      case TriggerConditionEnum.newContact:
      case TriggerConditionEnum.contactUnsubscribedFormBroadcast:
      case TriggerConditionEnum.archived:
      case TriggerConditionEnum.followUp:
      case TriggerConditionEnum.conversationAssigned:
      case TriggerConditionEnum.conversationUnassigned:
      case TriggerConditionEnum.subscribedToSequence:
      case TriggerConditionEnum.unsubscribedFromSequence:
      case TriggerConditionEnum.contactReferredANewContact:
      case TriggerConditionEnum.contactReferredExistingContact:
        return true

      case TriggerConditionEnum.dateTimeBasedTrigger:
        return await this.evaluateDateTimeCondition(
          sourceId,
          value,
          chatbotId,
          contactId,
          chatbot,
        )

      default:
        return false
    }
  }

  private evaluateTagCondition(
    _conditionType: number,
    expectedTagId: string | null,
    actualTagId: string,
  ): boolean {
    if (!expectedTagId) {
      return false
    }
    return expectedTagId === actualTagId
  }

  private evaluateCustomFieldCondition(
    customFieldId: string | null,
    operator: string | null,
    expectedValue: unknown,
    metadata: Record<string, unknown>,
  ): boolean {
    if (!customFieldId) {
      return false
    }

    const actualCustomFieldId = metadata.customFieldId as string
    const actualValue = metadata.newValue

    if (customFieldId !== actualCustomFieldId) {
      return false
    }

    if (!operator) {
      return true
    }

    return this.evaluateOperator(operator, actualValue, expectedValue)
  }

  private evaluateOperator(
    operator: string,
    actualValue: unknown,
    expectedValue: unknown,
  ): boolean {
    const expected =
      typeof expectedValue === "object" && expectedValue !== null
        ? (expectedValue as Record<string, unknown>).text ||
          (expectedValue as Record<string, unknown>).number ||
          (expectedValue as Record<string, unknown>).date ||
          expectedValue
        : expectedValue

    switch (operator) {
      case "is":
        return actualValue === expected
      case "isNot":
        return actualValue !== expected
      case "hasAnyValue":
        return actualValue != null && actualValue !== ""
      case "hasNoValue":
        return actualValue == null || actualValue === ""
      case "gt":
        return Number(actualValue) > Number(expected)
      case "lt":
        return Number(actualValue) < Number(expected)
      case "gte":
        return Number(actualValue) >= Number(expected)
      case "lte":
        return Number(actualValue) <= Number(expected)
      case "contains":
        return String(actualValue).includes(String(expected))
      case "doesNotContain":
        return !String(actualValue).includes(String(expected))
      case "startsWith":
        return String(actualValue).startsWith(String(expected))
      case "endsWith":
        return String(actualValue).endsWith(String(expected))
      case "interval":
      case "notInterval":
        return false
      default:
        return false
    }
  }

  private async evaluateDateTimeCondition(
    customFieldId: string | null,
    triggerConfig: unknown,
    _chatbotId: string,
    contactId: string,
    chatbot: ChatbotModel,
  ): Promise<boolean> {
    if (!(customFieldId && triggerConfig)) {
      return false
    }

    const contactCustomField = await prisma.contactCustomField.findFirst({
      where: {
        contactId,
        customFieldId,
      },
      select: { value: true },
    })

    if (!contactCustomField?.value) {
      return false
    }

    const customFieldValue = contactCustomField.value as string

    const config = triggerConfig as {
      triggerType?: string
      timeValue?: number
      timeType?: string
      at?: string
    }

    const { triggerType, timeValue, timeType, at } = config

    if (!triggerType) {
      return false
    }

    const timezone = chatbot?.accountTimezone || "UTC"

    const isDateOnly = DATE_ONLY_REGEX.test(customFieldValue.trim())
    let targetDate: Date

    if (isDateOnly) {
      const dateTimeStr = `${customFieldValue} 23:59:59.999`
      targetDate = new Date(
        new Date(dateTimeStr).toLocaleString("en-US", {
          timeZone: timezone,
        }),
      )
    } else {
      targetDate = new Date(
        new Date(customFieldValue).toLocaleString("en-US", {
          timeZone: timezone,
        }),
      )
    }

    const nowUTC = new Date()
    const nowInTimezone = new Date(
      nowUTC.toLocaleString("en-US", { timeZone: timezone }),
    )

    const now = nowInTimezone

    if (triggerType === "before") {
      if (!(timeValue && timeType)) {
        return false
      }
      const timeInMs = this.convertToMilliseconds(timeValue, timeType)
      const triggerTime = new Date(targetDate.getTime() - timeInMs)

      return now <= triggerTime
    }

    if (triggerType === "after") {
      if (!(timeValue && timeType)) {
        return false
      }
      const timeInMs = this.convertToMilliseconds(timeValue, timeType)
      const triggerTime = new Date(targetDate.getTime() + timeInMs)

      return now >= triggerTime
    }

    if (triggerType === "atTheDayOf") {
      let targetAt = at || ""

      if (targetAt === "" || targetAt === null || targetAt === undefined) {
        targetAt = targetDate.getHours().toString()
      }

      const isSameDay =
        now.getFullYear() === targetDate.getFullYear() &&
        now.getMonth() === targetDate.getMonth() &&
        now.getDate() === targetDate.getDate()

      if (!isSameDay) {
        return false
      }

      const targetHour = Number.parseInt(targetAt, 10)
      const currentHour = now.getHours()

      return currentHour === targetHour
    }

    return false
  }

  private convertToMilliseconds(value: number, type: string): number {
    switch (type) {
      case "minutes":
        return value * 60 * 1000
      case "hours":
        return value * 60 * 60 * 1000
      case "days":
        return value * 24 * 60 * 60 * 1000
      case "weeks":
        return value * 7 * 24 * 60 * 60 * 1000
      default:
        return 0
    }
  }
}
