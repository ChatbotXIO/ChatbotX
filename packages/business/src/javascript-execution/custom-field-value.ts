import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { EMAIL_RE, NON_DIGIT_RE, PHONE_RE } from "@chatbotx.io/imports/parsers"
import {
  canonicalNumberLiteral,
  coerceBooleanLiteral,
} from "@chatbotx.io/utils/custom-field"
import {
  type TemporalCustomFieldType,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import { normalizeTemporalValueForStorage } from "@chatbotx.io/utils/temporal-input"

export type CustomFieldValueNormalizer = (
  raw: string,
  timezone?: string | null,
) => string | null

/**
 * Same generous rule as every runtime write path (user-confirmed): a falsy
 * literal → "false", ANY other non-empty value → "true" — nobody has to type
 * the literal exactly. Blank input never reaches this normalizer
 * (`validateCustomFieldValue` short-circuits it as "skip"), so a non-empty
 * boolean cell/return value always imports.
 */
export const normalizeBoolean = (value: string): string | null =>
  coerceBooleanLiteral(value)

/**
 * Thin wrapper over the shared `number` canonicalizer in
 * `@chatbotx.io/utils/custom-field` (`canonicalNumberLiteral`) — the same
 * vocabulary the storage-side runtime coercion uses — mirroring how
 * `normalizeBoolean` above wraps `canonicalBooleanLiteral`. This WIDENS what
 * import/JS-execution accept from the old hand-rolled regex allowlist to
 * everything JS `Number()` accepts (`"+1"`, `"1."`, hex `"0x10"`);
 * unparseable/blank input still returns `null` (import/JS callers skip the
 * field rather than guess).
 */
export const normalizeNumber = (value: string): string | null =>
  canonicalNumberLiteral(value)

export const normalizeEmail = (raw: string): string | null => {
  const lower = raw.toLowerCase()
  return EMAIL_RE.test(lower) ? lower : null
}

export const normalizePhone = (value: string): string | null => {
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

/**
 * Shared core: does `raw` normalize to a valid value for `type`? Returns the
 * canonical string to persist, or `null` when it does not. Deliberately has
 * NO opinion on what a blank `raw` means — a blank spreadsheet cell means
 * "skip this row" to CSV import, but a blank JS-step return value means the
 * author explicitly returned nothing, which the JS step treats as a
 * mismatch for every non-text type. Callers decide.
 */
export const normalizeCustomFieldValueByType = (
  type: CustomFieldType,
  raw: string,
  timezone?: string | null,
): string | null => customFieldValueNormalizers[type](raw, timezone)

/**
 * CSV/spreadsheet import semantics: a blank cell means "no value for this
 * row" and is skipped, not rejected.
 */
export const validateCustomFieldValue = (
  type: CustomFieldType,
  raw: string,
  timezone?: string | null,
): string | null => {
  if (raw.length === 0) {
    return null
  }
  return normalizeCustomFieldValueByType(type, raw, timezone)
}
