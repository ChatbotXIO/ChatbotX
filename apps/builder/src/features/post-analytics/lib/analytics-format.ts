/** The sign of a change, which picks the arrow and the colour of a KPI tile. */
export type ChangeDirection = "up" | "down" | "flat" | "unknown"

/** Shown instead of a number that cannot be told. */
export const NO_VALUE = "—"

const COMPACT_FROM = 10_000

/** A count: written out below 10,000, compact (12.3K) above. */
export const formatCount = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: Math.abs(value) >= COMPACT_FROM ? "compact" : "standard",
  }).format(value)

/** A gain that may be negative; the sign is always written so a drop is never missed. */
export const formatGain = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: Math.abs(value) >= COMPACT_FROM ? "compact" : "standard",
    signDisplay: "exceptZero",
  }).format(value)

/** `+12.3%`, `-4%`, `0%`; "—" when the change cannot be told (`null`). */
export const formatChangePercent = (
  percent: number | null,
  locale: string,
): string =>
  percent === null
    ? NO_VALUE
    : new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
        signDisplay: "exceptZero",
        style: "percent",
      }).format(percent / 100)

export const changeDirection = (percent: number | null): ChangeDirection => {
  if (percent === null) {
    return "unknown"
  }
  if (percent > 0) {
    return "up"
  }
  return percent < 0 ? "down" : "flat"
}

/** A score of 1 is a typical post of the same page. */
export const formatScore = (score: number, locale: string): string =>
  new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(score)
