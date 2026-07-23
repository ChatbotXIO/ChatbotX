import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { EMAIL_RE, NON_DIGIT_RE, PHONE_RE } from "@chatbotx.io/imports/parsers"
import {
  type TemporalCustomFieldType,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import { normalizeTemporalValueForStorage } from "@chatbotx.io/utils/temporal-input"

const BOOL_RE = /^(true|false|1|0)$/i
const NUMERIC_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/
type CustomFieldValueNormalizer = (
  raw: string,
  timezone?: string | null,
) => string | null

const normalizeBoolean = (value: string): string | null => {
  if (!BOOL_RE.test(value)) {
    return null
  }
  const lower = value.toLowerCase()
  return lower === "true" || lower === "1" ? "true" : "false"
}

const normalizeNumber = (value: string): string | null => {
  if (!NUMERIC_RE.test(value)) {
    return null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? String(parsed) : null
}

const normalizeEmail = (raw: string): string | null => {
  const lower = raw.toLowerCase()
  return EMAIL_RE.test(lower) ? lower : null
}

const normalizePhone = (value: string): string | null => {
  if (!PHONE_RE.test(value)) {
    return null
  }
  const digits = value.replace(NON_DIGIT_RE, "")
  return digits.length > 0 ? digits : null
}

// A spreadsheet exported to CSV keeps whatever the author typed, so imports
// accept the same loose shapes the spreadsheet step does.
const normalizeTemporalImportValue =
  (type: TemporalCustomFieldType): CustomFieldValueNormalizer =>
  (raw, timezone) =>
    normalizeTemporalValueForStorage({
      type,
      value: raw,
      timezone,
      parsing: TemporalInputParsing.Lenient,
    })

const customFieldValueNormalizers = {
  boolean: normalizeBoolean,
  date: normalizeTemporalImportValue("date"),
  datetime: normalizeTemporalImportValue("datetime"),
  email: normalizeEmail,
  longText: (raw) => raw,
  number: normalizeNumber,
  phoneNumber: normalizePhone,
  shortText: (raw) => raw,
} as const satisfies Record<CustomFieldType, CustomFieldValueNormalizer>

export const validateCustomFieldValue = (
  type: CustomFieldType,
  raw: string,
  timezone?: string | null,
): string | null => {
  if (raw.length === 0) {
    return null
  }
  return customFieldValueNormalizers[type](raw, timezone)
}
