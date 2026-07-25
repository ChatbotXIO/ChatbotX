/**
 * What a matcher recovered from the raw text.
 *
 * `naive` means the value named a wall-clock reading with no zone of its own —
 * it still has to be anchored. `absolute` means the value already pinned an
 * instant (an explicit offset, or a unix timestamp) and must not be re-anchored.
 */
export type TemporalParseResult =
  | { readonly kind: "naive"; readonly date: Date }
  | { readonly kind: "absolute"; readonly instant: Date }

/**
 * Ambient facts a matcher may need beyond the raw text: the zone the value is
 * anchored to, and the instant that counts as "now" for inputs that omit a
 * calendar day. `now` is injected so parsing stays deterministic under test.
 */
export type TemporalMatchContext = {
  readonly timezone: string
  readonly now: Date
}

export type TemporalMatcher = {
  readonly name: string
  readonly match: (
    raw: string,
    context: TemporalMatchContext,
  ) => TemporalParseResult | null
}
