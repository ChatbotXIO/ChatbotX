/**
 * Pure helpers backing `enqueueEventInput` (see `schema.ts`). Kept
 * dependency-free so the parsing rule is unit-testable in isolation from the
 * schema's cross-field `superRefine` checks.
 */

/**
 * Splits a comma-separated Meta `content_ids` string (e.g. `"123, 456"`)
 * into a trimmed, non-empty `string[]`. Blank segments (`"a,,b"`) are
 * dropped. An empty/blank input — or anything that is not a string, e.g. a
 * caller that already passes an array — returns `undefined` rather than an
 * empty array, so "not set" stays `undefined` end to end. Used as the
 * `z.preprocess` step ahead of `z.array(z.string().min(1)).min(1).optional()`
 * in `enqueueEventInput`.
 */
export function splitContentIds(value: unknown): unknown {
  if (typeof value !== "string") {
    return value
  }

  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

  return ids.length > 0 ? ids : undefined
}
