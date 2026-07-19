export const NUMERIC_VALUE_PATTERN = /^-?\d+(\.\d+)?$/

export const DATETIME_VALUE_PATTERN =
  "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])([T ]([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d(\\.\\d{1,6})?)?(Z|[+-]([01]\\d|2[0-3]):?[0-5]\\d)?)?$"

const DATETIME_VALUE_RE = new RegExp(DATETIME_VALUE_PATTERN)

export const isValidDateTimeFilterValue = (value: string): boolean =>
  DATETIME_VALUE_RE.test(value) && !Number.isNaN(Date.parse(value))

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
  return false
}
