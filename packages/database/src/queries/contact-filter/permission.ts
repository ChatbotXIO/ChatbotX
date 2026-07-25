import { type ContactFilterField, contactFilterFields } from "../../partials"
import type { ContactFilterCriteriaInput } from "./types"

export const EMAIL_PHONE_FILTER_FIELDS = [
  contactFilterFields.enum.email,
  contactFilterFields.enum.phone,
  contactFilterFields.enum.hasContactInfo,
  contactFilterFields.enum.emailWasVerified,
  contactFilterFields.enum.optedInForEmail,
  contactFilterFields.enum.existingContact,
] as const satisfies readonly ContactFilterField[]

const toConditionWithField = (
  condition: unknown,
): { field?: unknown } | undefined =>
  typeof condition === "object" && condition !== null
    ? (condition as { field?: unknown })
    : undefined

export function pruneContactFilterFields(
  contactFilter: ContactFilterCriteriaInput | null | undefined,
  excludedFields: readonly ContactFilterField[],
): ContactFilterCriteriaInput | undefined {
  if (!contactFilter) {
    return
  }
  if (excludedFields.length === 0 || contactFilter.conditions.length === 0) {
    return contactFilter
  }

  const excludedFieldSet = new Set<string>(excludedFields)
  const conditions = contactFilter.conditions.filter((condition) => {
    const field = toConditionWithField(condition)?.field
    return typeof field !== "string" || !excludedFieldSet.has(field)
  })

  // Spread the original so boundary-only fields (notably `timezone`, which the
  // date-range WHERE resolves against) survive pruning — listing fields by hand
  // silently drops any not enumerated here.
  return {
    ...contactFilter,
    operator: conditions.length > 0 ? contactFilter.operator : "and",
    conditions,
  }
}

export function pruneEmailPhoneFilterConditions(
  contactFilter: ContactFilterCriteriaInput | null | undefined,
  canViewEmailAndPhone: boolean,
): ContactFilterCriteriaInput | undefined {
  return canViewEmailAndPhone
    ? (contactFilter ?? undefined)
    : pruneContactFilterFields(contactFilter, EMAIL_PHONE_FILTER_FIELDS)
}
