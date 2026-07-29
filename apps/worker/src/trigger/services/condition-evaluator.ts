import { db } from "@chatbotx.io/database/client"
import {
  type OperatorType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { toZonedWallClock } from "@chatbotx.io/utils/datetime"
import type { ConditionEvaluationContext } from "../types"
import { parseDateTimeValue } from "../utils/datetime-calculator"

export class ConditionEvaluator {
  async evaluate(context: ConditionEvaluationContext): Promise<boolean> {
    const { condition, eventData, workspaceId, contactId, workspace } = context
    const { type, sourceId, operator, value } = condition

    switch (type) {
      case triggerEventTypes.enum.tagApplied:
      case triggerEventTypes.enum.tagRemoved:
        return this.evaluateSourceIdMatch(
          sourceId,
          eventData.eventData.tagId as string,
        )

      case triggerEventTypes.enum.contactInfoUpdated:
        return this.evaluateSourceIdMatch(
          sourceId,
          eventData.eventData.infoType as string,
        )

      case triggerEventTypes.enum.customFieldValueChanged:
        return await this.evaluateCustomFieldCondition(
          sourceId,
          operator as OperatorType | null,
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

  /** Conditions pinned to a source (tag id, contact info type, …) match only that exact source. */
  private evaluateSourceIdMatch(
    expectedSourceId: string | null,
    actualSourceId: string,
  ): boolean {
    if (!expectedSourceId) {
      return false
    }
    return expectedSourceId === actualSourceId
  }

  private async evaluateCustomFieldCondition(
    customFieldId: string | null,
    operator: OperatorType | null,
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
      this.extractConditionTimezone(expectedValue) ||
        workspace.timezone ||
        "UTC",
    )
  }

  /**
   * Timezone the editor captured on the condition's stored value (e.g.
   * `{ text, timezone }` for a date/datetime comparison). Absent on legacy
   * conditions, in which case callers fall back to the workspace zone.
   */
  private extractConditionTimezone(value: unknown): string | undefined {
    if (typeof value === "object" && value !== null) {
      const timezone = (value as Record<string, unknown>).timezone
      if (typeof timezone === "string" && timezone.length > 0) {
        return timezone
      }
    }
    return
  }

  /**
   * The trigger editor persists operators from the `operatorTypes` enum
   * (`eq`, `ne`, `isEmpty`, …) — the shared contact-filter vocabulary — while
   * this evaluator was originally written against a legacy `is`/`isNot`/
   * `hasAnyValue` spelling. Map the stored vocabulary onto the internal one at
   * this single boundary so unrecognized names can no longer fall through to
   * `default: return false` and silently drop a matching condition. Legacy
   * values pass through unchanged, keeping any old stored conditions working.
   */
  private normalizeOperator(operator: OperatorType): string {
    const aliases: Record<string, string> = {
      eq: "is",
      ne: "isNot",
      isEmpty: "hasNoValue",
      isNotEmpty: "hasAnyValue",
      notContains: "doesNotContain",
      isBetween: "interval",
      notBetween: "notInterval",
    }
    return aliases[operator] ?? operator
  }

  private evaluateOperator(
    operator: OperatorType,
    actualValue: unknown,
    expectedValue: unknown,
    customFieldType?: string,
    timezone?: string,
  ): boolean {
    const normalizedOperator = this.normalizeOperator(operator)

    if (normalizedOperator === "hasAnyValue") {
      return actualValue != null && actualValue !== ""
    }

    if (normalizedOperator === "hasNoValue") {
      return (
        actualValue == null || actualValue === "" || actualValue === undefined
      )
    }

    const expected = this.extractExpectedValue(expectedValue)
    const isDateField =
      customFieldType === "date" || customFieldType === "datetime"

    if (
      normalizedOperator === "interval" ||
      normalizedOperator === "notInterval"
    ) {
      return this.evaluateIntervalOperator(
        normalizedOperator,
        actualValue,
        expected,
        isDateField,
        timezone,
      )
    }

    if (isDateField) {
      return this.evaluateDateOperator(
        normalizedOperator,
        actualValue,
        expected,
        timezone || "UTC",
      )
    }

    return this.evaluateStandardOperator(
      normalizedOperator,
      actualValue,
      expected,
    )
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
      timezone?: string
    }

    const { triggerType, timeValue, timeType, at } = config

    if (!triggerType) {
      return false
    }

    // Per-condition zone captured in the editor wins; legacy conditions with
    // none fall back to the workspace zone, then UTC.
    const timezone = config.timezone || workspace?.timezone

    // `datetime` values are persisted as a UTC instant; `date` values as an
    // offset-preserved start-of-day (e.g. `...+07:00`). `parseDateTimeValue`
    // resolves either into the condition's zone as a wall-clock moment, and also
    // guards a bare "YYYY-MM-DD" (read as local midnight) and unparseable values.
    const targetDate = parseDateTimeValue(customFieldValue, timezone)
    if (!targetDate) {
      return false
    }
    const now = toZonedWallClock(new Date(), timezone)

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
