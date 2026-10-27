import { MONEY_SCALE } from "@chatbotx.io/database/partials"
import { shortTimeAgo } from "@/features/conversations/lib/short-time-ago"
import { formatPrice } from "@/lib/format-price"

/** Money in the pipeline currency, locale-aware; falls back for unknown codes. */
export function formatItemValue(
  value: number,
  currency: string,
  locale = "en",
): string {
  return formatPrice(locale, value, currency, {
    maximumFractionDigits: MONEY_SCALE,
  })
}

/** Compact, locale-aware age of an item ("5 min. ago", "3 hr. ago", "2 days ago"). */
export function formatItemAge(
  createdAt: Date,
  locale: string,
  now = new Date(),
): string {
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "always",
    style: "narrow",
  })
  const { unit, count } = shortTimeAgo(createdAt, now.getTime())
  return formatter.format(-count, unit === "now" ? "minute" : unit)
}
