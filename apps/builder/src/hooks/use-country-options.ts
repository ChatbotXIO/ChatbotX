"use client"

import { getCountries } from "libphonenumber-js"
import { useLocale } from "next-intl"
import { useMemo } from "react"

/** Every country as `{ value: "VN", label: "Vietnam" }`, named in the UI language. */
export const useCountryOptions = () => {
  const locale = useLocale()
  return useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" })
    return getCountries()
      .map((code) => ({ value: code, label: names.of(code) ?? code }))
      .sort((a, b) => a.label.localeCompare(b.label, locale))
  }, [locale])
}
