import type { DateTimeSweepCursor } from "@chatbotx.io/database/repositories"
import type { DateTimeCondition } from "../trigger/utils/datetime-calculator"
import {
  matchesDateTimeCondition,
  parseDateTimeValue,
} from "../trigger/utils/datetime-calculator"

export type DateTimeSweepContactCustomField = {
  contact: { workspaceId: string }
  contactId: string
  customFieldId: string
  value: unknown
}

export type DateTimeSweepEntity = {
  conditions: DateTimeCondition[]
  timezone: string
  workspaceId: string
}

export async function forEachSweepPage(
  fetchPage: (cursor?: DateTimeSweepCursor) => Promise<{
    nextCursor?: DateTimeSweepCursor
    rows: DateTimeSweepContactCustomField[]
  }>,
  processPage: (rows: DateTimeSweepContactCustomField[]) => Promise<void>,
): Promise<void> {
  let cursor: DateTimeSweepCursor | undefined

  while (true) {
    const { rows, nextCursor } = await fetchPage(cursor)
    if (rows.length === 0) {
      break
    }

    await processPage(rows)

    if (!nextCursor) {
      break
    }
    cursor = nextCursor
  }
}

export function extractDateTimeCustomFieldIds<T extends DateTimeSweepEntity>(
  entityMap: Record<string, T>,
): Set<string> {
  const customFieldIds = new Set<string>()
  for (const entity of Object.values(entityMap)) {
    for (const condition of entity.conditions) {
      customFieldIds.add(condition.customFieldId)
    }
  }
  return customFieldIds
}

export function buildContactCustomFieldMap(
  contactCustomFields: DateTimeSweepContactCustomField[],
): Map<string, Map<string, unknown>> {
  const contactCustomFieldMap = new Map<string, Map<string, unknown>>()
  for (const customField of contactCustomFields) {
    if (!contactCustomFieldMap.has(customField.contactId)) {
      contactCustomFieldMap.set(customField.contactId, new Map())
    }

    contactCustomFieldMap
      .get(customField.contactId)
      ?.set(customField.customFieldId, customField.value)
  }
  return contactCustomFieldMap
}

export function filterContactsWithAnyCustomField(
  contactCustomFields: DateTimeSweepContactCustomField[],
  entity: DateTimeSweepEntity,
): Set<string> {
  const requiredCustomFieldIds = new Set(
    entity.conditions.map((condition) => condition.customFieldId),
  )
  const contactsToCheck = new Set<string>()

  for (const customField of contactCustomFields) {
    if (customField.contact.workspaceId !== entity.workspaceId) {
      continue
    }

    if (requiredCustomFieldIds.has(customField.customFieldId)) {
      contactsToCheck.add(customField.contactId)
    }
  }

  return contactsToCheck
}

export function findMatchingDateTimeCondition(
  entity: DateTimeSweepEntity,
  customFieldValues: Map<string, unknown>,
  params: { startOfMinute: number },
): DateTimeCondition | undefined {
  for (const condition of entity.conditions) {
    // Per-condition zone captured in the editor wins; legacy conditions with
    // none fall back to the workspace zone carried on the entity.
    const timezone = condition.timezone || entity.timezone
    const customFieldValue = customFieldValues.get(condition.customFieldId)
    const datetimeValue = parseDateTimeValue(customFieldValue, timezone)

    if (
      datetimeValue &&
      matchesDateTimeCondition(datetimeValue, condition, params, timezone)
    ) {
      return condition
    }
  }
}

export function allDateTimeConditionsMatch(
  entity: DateTimeSweepEntity,
  customFieldValues: Map<string, unknown>,
  params: { startOfMinute: number },
): boolean {
  for (const condition of entity.conditions) {
    // Per-condition zone captured in the editor wins; legacy conditions with
    // none fall back to the workspace zone carried on the entity.
    const timezone = condition.timezone || entity.timezone
    const customFieldValue = customFieldValues.get(condition.customFieldId)
    const datetimeValue = parseDateTimeValue(customFieldValue, timezone)

    if (
      !(
        datetimeValue &&
        matchesDateTimeCondition(datetimeValue, condition, params, timezone)
      )
    ) {
      return false
    }
  }

  return true
}
