/**
 * Canonical grammar for a runtime variable placeholder, e.g. `{{full_name}}`,
 * `{{raw:field}}`, or `{{coupon:SUMMER}}`. This is the single source of truth
 * shared by the interpolation engine (`@chatbotx.io/variables`) and edit-time
 * validators (e.g. `zodUrlWithVariables`), so a value accepted at edit time is
 * exactly one the runtime will resolve. A token is any run of characters other
 * than a brace or a newline (the resolver trims surrounding whitespace), so it
 * never spans braces or lines.
 *
 * Exported as the pattern source (no flags) so each consumer can build the
 * regex it needs — global for `matchAll`/`replace`, non-global for `test`.
 */
export const VARIABLE_PLACEHOLDER_SOURCE = String.raw`\{\{(coupon:[^{}\n]+|raw:[^{}\n]+|[^{}\n]+)\}\}`

// Non-global: `.test` stays stateless (no `lastIndex` advance between calls).
const VARIABLE_PLACEHOLDER_REGEX = new RegExp(VARIABLE_PLACEHOLDER_SOURCE)

/** True when `value` embeds at least one `{{variable}}` placeholder. */
export const containsVariablePlaceholder = (value: string): boolean =>
  VARIABLE_PLACEHOLDER_REGEX.test(value)
