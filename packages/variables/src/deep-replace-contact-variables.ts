import { contactVariableService } from "./contact-variable"
import type { ReplaceVariableProps } from "./schema"

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === null || proto === Object.prototype
}

/** Sync tree walk: true if any string in the structure contains `{{`. */
export const valueContainsVariablePlaceholder = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === "string") {
    return value.includes("{{")
  }
  if (Array.isArray(value)) {
    return value.some(valueContainsVariablePlaceholder)
  }
  if (isPlainObject(value)) {
    return Object.values(value).some(valueContainsVariablePlaceholder)
  }
  return false
}

const deepReplaceStrings = async <T>(
  value: T,
  variables: ReplaceVariableProps,
): Promise<T> => {
  if (value === null || value === undefined) {
    return value
  }
  if (typeof value === "string") {
    if (!value.includes("{{")) {
      return value
    }
    return (await contactVariableService.replaceAll({
      variables,
      text: value,
    })) as T
  }
  if (Array.isArray(value)) {
    const next = await Promise.all(
      value.map((item) => deepReplaceStrings(item, variables)),
    )
    return next as T
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) {
      out[key] = await deepReplaceStrings(value[key], variables)
    }
    return out as T
  }
  return value
}

/**
 * Recursively replaces `{{var}}` in every string leaf. Loads contact data once
 * when any placeholder exists; otherwise returns the input unchanged.
 */
export const resolveContactVariablesDeep = async <T>(
  contactId: string,
  value: T,
): Promise<T> => {
  if (!valueContainsVariablePlaceholder(value)) {
    return value
  }
  const variables = await contactVariableService.getAll(contactId)
  return deepReplaceStrings(value, variables)
}
