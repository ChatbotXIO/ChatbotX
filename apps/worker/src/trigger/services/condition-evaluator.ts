import { db } from "@chatbotx.io/database/client"
import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import type { ConditionEvaluationContext } from "../types"
import { parseDateTimeValue } from "../utils/datetime-calculator"

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export class ConditionEvaluator {
  async evaluate(context: ConditionEvaluationContext): Promise<boolean> {
    const { condition, eventData, workspaceId, contactId, workspace } = context
    const { type, sourceId, operator, value } = condition

    switch (type) {
      case triggerEventTypes.enum.tagApplied:
      case triggerEventTypes.enum.tagRemoved:
        return this.evaluateTagCondition(
          type,
          sourceId,
          eventData.eventData.tagId as string,
        )

      case triggerEventTypes.enum.customFieldValueChanged:
        return await this.evaluateCustomFieldCondition(
          sourceId,
          operator,
          value,
          eventData.eventData,
          contactId,
          workspace,
        )

      case triggerEventTypes.enum.conversationTransferredToHuman:
      case triggerEventTypes.enum.conversationTransferredToBot:
      case triggerEventTypes.enum.newContact:
      case triggerEventTypes.enum.contactUnsubscribedFormBroadcast:
      case triggerEventTypes.enum.archived:
      case triggerEventTypes.enum.followUp:
      case triggerEventTypes.enum.conversationAssigned:
      case triggerEventTypes.enum.conversationUnassigned:
      case triggerEventTypes.enum.subscribedToSequence:
      case triggerEventTypes.enum.unsubscribedFromSequence:
      case triggerEventTypes.enum.contactReferredANewContact:
      case triggerEventTypes.enum.contactReferredExistingContact:
        return true

      case triggerEventTypes.enum.dateTimeBasedTrigger:
        return await this.evaluateDateTimeCondition(
          sourceId,
          value,
          workspaceId,
          contactId,
          workspace,
        )

      default:
        return false
    }
  }

  private evaluateTagCondition(
    _conditionType: string,
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
    workspace: WorkspaceModel,
  ): Promise<boolean> {
    if (!customFieldId) {
      return false
    }

    const actualCustomFieldId = metadata.customFieldId as string
    let actualValue: unknown

    if (customFieldId === actualCustomFieldId) {
      actualValue = metadata.newValue
    } else {
      const contactCustomField =
        await db.query.contactCustomFieldModel.findFirst({
          where: {
            contactId,
            customFieldId,
          },
          columns: { value: true },
        })
      actualValue = contactCustomField?.value
    }

    const customField = await db.query.customFieldModel.findFirst({
      where: { id: customFieldId },
      columns: { type: true },
    })

    if (!operator) {
      return true
    }

    return this.evaluateOperator(
      operator,
      actualValue,
      expectedValue,
      customField?.type,
      workspace.timezone || "UTC",
    )
  }

  private evaluateOperator(
    operator: string,
    actualValue: unknown,
    expectedValue: unknown,
    customFieldType?: string,
    timezone?: string,
  ): boolean {
    if (operator === "hasAnyValue") {
      return actualValue != null && actualValue !== ""
    }

    if (operator === "hasNoValue") {
      return (
        actualValue == null || actualValue === "" || actualValue === undefined
      )
    }

    const expected = this.extractExpectedValue(expectedValue)
    const isDateField =
      customFieldType === "date" || customFieldType === "datetime"

    if (operator === "interval" || operator === "notInterval") {
      return this.evaluateIntervalOperator(
        operator,
        actualValue,
        expected,
        isDateField,
        timezone,
      )
    }

    if (isDateField) {
      return this.evaluateDateOperator(
        operator,
        actualValue,
        expected,
        timezone || "UTC",
      )
    }

    return this.evaluateStandardOperator(operator, actualValue, expected)
  }

  private extractExpectedValue(expectedValue: unknown): unknown {
    if (typeof expectedValue === "object" && expectedValue !== null) {
      const obj = expectedValue as Record<string, unknown>
      return obj.text || obj.number || obj.date || expectedValue
    }
    return expectedValue
  }

  private evaluateDateOperator(
    operator: string,
    actualValue: unknown,
    expected: unknown,
    timezone: string,
  ): boolean {
    if (!(actualValue && expected)) {
      return false
    }

    const actualDateObj = parseDateTimeValue(actualValue, timezone)
    const expectedDateObj = parseDateTimeValue(expected, timezone)

    if (!(actualDateObj && expectedDateObj)) {
      return false
    }

    const actualDate = actualDateObj.getTime()
    const expectedDate = expectedDateObj.getTime()

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
        return false
    }
  }

  private evaluateIntervalOperator(
    operator: string,
    actualValue: unknown,
    expected: unknown,
    isDateField: boolean,
    timezone?: string,
  ): boolean {
    if (!(actualValue && expected)) {
      return false
    }

    const interval = this.parseInterval(
      expected,
      isDateField ? timezone : undefined,
    )
    if (!interval) {
      return false
    }

    let valueTimestamp: number

    if (isDateField && timezone) {
      const dateObj = parseDateTimeValue(actualValue, timezone)
      if (!dateObj) {
        return false
      }
      valueTimestamp = dateObj.getTime()
    } else {
      valueTimestamp = new Date(actualValue as string).getTime()
    }

    if (operator === "interval") {
      return valueTimestamp >= interval.start && valueTimestamp <= interval.end
    }

    return valueTimestamp < interval.start || valueTimestamp > interval.end
  }

  private evaluateStandardOperator(
    operator: string,
    actualValue: unknown,
    expected: unknown,
  ): boolean {
    switch (operator) {
      case "is":
        return actualValue === expected
      case "isNot":
        return actualValue !== expected
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
      default:
        return false
    }
  }

  private parseInterval(
    value: unknown,
    timezone?: string,
  ): { start: number; end: number } | null {
    try {
      if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>
        const start = obj.start || obj.from || obj.startDate
        const end = obj.end || obj.to || obj.endDate

        if (start && end) {
          if (timezone) {
            const startDate = parseDateTimeValue(start, timezone)
            const endDate = parseDateTimeValue(end, timezone)
            if (startDate && endDate) {
              return {
                start: startDate.getTime(),
                end: endDate.getTime(),
              }
            }
          }
          return {
            start: new Date(start as string).getTime(),
            end: new Date(end as string).getTime(),
          }
        }
      }

      if (Array.isArray(value) && value.length === 2) {
        if (timezone) {
          const startDate = parseDateTimeValue(value[0], timezone)
          const endDate = parseDateTimeValue(value[1], timezone)
          if (startDate && endDate) {
            return {
              start: startDate.getTime(),
              end: endDate.getTime(),
            }
          }
        }
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
    _workspaceId: string,
    contactId: string,
    workspace: WorkspaceModel,
  ): Promise<boolean> {
    if (!(customFieldId && triggerConfig)) {
      return false
    }

    const contactCustomField = await db.query.contactCustomFieldModel.findFirst(
      {
        where: {
          contactId,
          customFieldId,
        },
        columns: { value: true },
      },
    )

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

    const timezone = workspace?.timezone || "UTC"

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

    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: timezone }),
    )

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
