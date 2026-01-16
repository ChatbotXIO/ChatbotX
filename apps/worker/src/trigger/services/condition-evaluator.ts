import { prisma } from "@aha.chat/database"
import { TriggerCondition as TriggerConditionEnum } from "@aha.chat/database/enums"
import type { ChatbotModel } from "@aha.chat/database/types"
import type { ConditionEvaluationContext } from "../types"
import { parseDateTimeValue } from "../utils/datetime-calculator"

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
        return await this.evaluateCustomFieldCondition(
          sourceId,
          operator,
          value,
          eventData.eventData,
          contactId,
          chatbot,
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

  private async evaluateCustomFieldCondition(
    customFieldId: string | null,
    operator: string | null,
    expectedValue: unknown,
    metadata: Record<string, unknown>,
    contactId: string,
    chatbot: ChatbotModel,
  ): Promise<boolean> {
    if (!customFieldId) {
      return false
    }

    const actualCustomFieldId = metadata.customFieldId as string
    let actualValue: unknown

    if (customFieldId === actualCustomFieldId) {
      actualValue = metadata.newValue
    } else {
      const contactCustomField = await prisma.contactCustomField.findFirst({
        where: {
          contactId,
          customFieldId,
        },
        select: { value: true },
      })
      actualValue = contactCustomField?.value
    }

    const customField = await prisma.field.findUnique({
      where: { id: customFieldId },
      select: { customFieldType: true },
    })

    console.log({
      customFieldId,
      actualCustomFieldId,
      expectedValue,
      actualValue,
      operator,
      customFieldType: customField?.customFieldType,
    })

    if (!operator) {
      return true
    }

    return this.evaluateOperator(
      operator,
      actualValue,
      expectedValue,
      customField?.customFieldType,
      chatbot.accountTimezone || "UTC",
    )
  }

  private evaluateOperator(
    operator: string,
    actualValue: unknown,
    expectedValue: unknown,
    customFieldType?: string,
    _timezone?: string,
  ): boolean {
    const expected =
      typeof expectedValue === "object" && expectedValue !== null
        ? (expectedValue as Record<string, unknown>).text ||
          (expectedValue as Record<string, unknown>).number ||
          (expectedValue as Record<string, unknown>).date ||
          expectedValue
        : expectedValue

    const isDateField =
      customFieldType === "date" || customFieldType === "datetime"

    if (isDateField) {
      switch (operator) {
        case "hasAnyValue":
          return actualValue != null && actualValue !== ""
        case "hasNoValue":
          return (
            actualValue == null ||
            actualValue === "" ||
            actualValue === undefined
          )
        case "interval": {
          if (!(actualValue && expected)) {
            return false
          }
          const interval = this.parseInterval(expected)
          if (!interval) {
            return false
          }
          const value = new Date(actualValue as string).getTime()
          return value >= interval.start && value <= interval.end
        }
        case "notInterval": {
          if (!(actualValue && expected)) {
            return false
          }
          const interval = this.parseInterval(expected)
          if (!interval) {
            return false
          }
          const value = new Date(actualValue as string).getTime()
          return value < interval.start || value > interval.end
        }
        default:
          break
      }

      if (actualValue && expected) {
        const timezone = _timezone || "UTC"
        const actualDateObj = parseDateTimeValue(actualValue, timezone)
        const expectedDateObj = parseDateTimeValue(expected, timezone)

        if (!(actualDateObj && expectedDateObj)) {
          return false
        }

        const actualDate = actualDateObj.getTime()
        const expectedDate = expectedDateObj.getTime()

        console.log({ actualDate, expectedDate, operator, timezone })

        switch (operator) {
          case "is":
            return actualDate === expectedDate
          case "isNot":
            return actualDate !== expectedDate
          case "gt":
            return actualDate > expectedDate
          case "lt":
            return actualDate < expectedDate
          case "gte":
            return actualDate >= expectedDate
          case "lte":
            return actualDate <= expectedDate
          default:
            break
        }
      }
    }

    switch (operator) {
      case "is":
        return actualValue === expected
      case "isNot":
        return actualValue !== expected
      case "hasAnyValue":
        return actualValue != null && actualValue !== ""
      case "hasNoValue":
        return (
          actualValue == null || actualValue === "" || actualValue === undefined
        )
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
      case "interval": {
        if (!(actualValue && expected)) {
          return false
        }
        const interval = this.parseInterval(expected)
        if (!interval) {
          return false
        }
        const value = new Date(actualValue as string).getTime()
        return value >= interval.start && value <= interval.end
      }
      case "notInterval": {
        if (!(actualValue && expected)) {
          return false
        }
        const interval = this.parseInterval(expected)
        if (!interval) {
          return false
        }
        const value = new Date(actualValue as string).getTime()
        return value < interval.start || value > interval.end
      }
      default:
        return false
    }
  }

  private parseInterval(value: unknown): { start: number; end: number } | null {
    try {
      if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>
        const start = obj.start || obj.from || obj.startDate
        const end = obj.end || obj.to || obj.endDate

        if (start && end) {
          return {
            start: new Date(start as string).getTime(),
            end: new Date(end as string).getTime(),
          }
        }
      }

      if (Array.isArray(value) && value.length === 2) {
        return {
          start: new Date(value[0] as string).getTime(),
          end: new Date(value[1] as string).getTime(),
        }
      }

      return null
    } catch {
      return null
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
