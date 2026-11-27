import type { useFormatter } from "next-intl"

type Formatter = ReturnType<typeof useFormatter>

/**
 * Compact, locale-aware count shared by every usage surface (500,000,000 →
 * 500M) so the same value never reads differently in the ring and the bars.
 */
export function formatCompactCount(formatter: Formatter, value: number) {
  return formatter.number(value, {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  })
}
