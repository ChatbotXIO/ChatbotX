import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { EMAIL_RE, NON_DIGIT_RE, PHONE_RE } from "@chatbotx.io/imports/parsers"

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const BOOL_RE = /^(true|false|1|0)$/i
const NUMERIC_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/

const stripFormulaEscape = (raw: string): string =>
  raw.startsWith("'") ? raw.slice(1) : raw

const normalizeBoolean = (raw: string): string | null => {
  const value = stripFormulaEscape(raw)
  if (!BOOL_RE.test(value)) {
    return null
  }
  const lower = value.toLowerCase()
  return lower === "true" || lower === "1" ? "true" : "false"
}

const normalizeNumber = (raw: string): string | null => {
  const value = stripFormulaEscape(raw)
  if (!NUMERIC_RE.test(value)) {
    return null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? String(parsed) : null
}

const normalizeDate = (raw: string): string | null => {
  const value = stripFormulaEscape(raw)
  if (!DATE_ONLY_RE.test(value)) {
    return null
  }
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : value
}

const normalizeDateTime = (raw: string): string | null => {
  const value = stripFormulaEscape(raw)
  if (!value.includes("T")) {
    return null
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    return null
  }
  return new Date(ms).toISOString()
}

const normalizeEmail = (raw: string): string | null => {
  const value = stripFormulaEscape(raw)
  if (FORMULA_PREFIX_RE.test(value)) {
    return null
  }
  const lower = value.toLowerCase()
  return EMAIL_RE.test(lower) ? lower : null
}

const normalizePhone = (raw: string): string | null => {
  const value = stripFormulaEscape(raw)
  if (!PHONE_RE.test(value)) {
    return null
  }
  const digits = value.replace(NON_DIGIT_RE, "")
  return digits.length > 0 ? digits : null
}

export const validateCustomFieldValue = (
  type: CustomFieldType,
  raw: string,
): string | null => {
  if (raw.length === 0) {
    return null
  }
  switch (type) {
    case "shortText":
    case "longText":
      return raw
    case "email":
      return normalizeEmail(raw)
    case "phoneNumber":
      return normalizePhone(raw)
    case "number":
      return normalizeNumber(raw)
    case "boolean":
      return normalizeBoolean(raw)
    case "date":
      return normalizeDate(raw)
    case "datetime":
      return normalizeDateTime(raw)
    default: {
      const exhaustive: never = type
      throw new Error(`Unknown custom field type: ${exhaustive as string}`)
    }
  }
}
