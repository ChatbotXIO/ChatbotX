import { type Locale, localeMeta } from "./config"

export type Direction = "ltr" | "rtl"

const RTL_LOCALES = new Set<string>(
  Object.entries(localeMeta)
    .filter(([, meta]) => meta.dir === "rtl")
    .map(([locale]) => locale as Locale),
)

export function getDirection(locale: string): Direction {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr"
}
