import { useLocale } from "next-intl"
import { useMemo } from "react"

/** "Vietnamese Dong (VND)": the localized name, with the code people know it by. */
const currencyLabel = (names: Intl.DisplayNames, code: string) =>
  `${names.of(code) ?? code} (${code})`

/** Labels one currency code the way the options list does. */
export const useCurrencyLabel = () => {
  const locale = useLocale()
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "currency" })
    return (code: string) => currencyLabel(names, code)
  }, [locale])
}

/**
 * Every ISO 4217 currency the runtime knows, labelled by its localized name
 * and code ("Vietnamese Dong (VND)"). `current` is kept even when the runtime
 * lacks it; an empty one (no value chosen) adds no option, as
 * `DisplayNames.of("")` throws.
 */
export const useCurrencyOptions = (current: string) => {
  const locale = useLocale()
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "currency" })
    const codes = new Set([
      ...(current ? [current] : []),
      ...Intl.supportedValuesOf("currency"),
    ])
    return [...codes]
      .map((code) => ({ value: code, label: currencyLabel(names, code) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale))
  }, [current, locale])
}
