export type Direction = "ltr" | "rtl"

const RTL_LOCALES = new Set(["ar"])

export function getDirection(locale: string): Direction {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr"
}
