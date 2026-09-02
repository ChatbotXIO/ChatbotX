import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { canonicalBooleanLiteral } from "@chatbotx.io/utils/custom-field"
import { formatCustomFieldValueInTimeZone } from "@chatbotx.io/utils/datetime"

type BooleanLabels = { true: string; false: string }

/**
 * Display-only formatting shared by every read-only custom/bot-field value
 * surface (Account Fields card, contact detail panel, …) — never mutates the
 * stored value.
 *
 * - `boolean`: localized True/False label, resolved via
 *   `canonicalBooleanLiteral` so legacy pre-normalization rows (`"TRUE"`,
 *   `"1"`, `" true "`, …) still render correctly instead of raw text. A
 *   blank or unrecognized stored value falls back to the raw text so an
 *   admin can still see (and fix) the garbage value.
 * - `date` / `datetime`: formatted for display in `timezone` via the same
 *   `formatCustomFieldValueInTimeZone` helper the rest of the app uses —
 *   never a hand-rolled date formatter.
 * - every other type: returned as-is.
 */
export function formatCustomFieldDisplayValue(
  type: CustomFieldType,
  value: string | null | undefined,
  timezone: string,
  booleanLabels: BooleanLabels,
): string | null | undefined {
  if (type === "boolean") {
    if (!value) {
      return value
    }
    const canonical = canonicalBooleanLiteral(value)
    if (canonical === "true") {
      return booleanLabels.true
    }
    if (canonical === "false") {
      return booleanLabels.false
    }
    return value
  }

  if (type === "date" || type === "datetime") {
    return formatCustomFieldValueInTimeZone(type, value, timezone)
  }

  return value
}
