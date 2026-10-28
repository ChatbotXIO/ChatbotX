import { countries } from "countries-list"

/**
 * The currency a country primarily uses, or `null` when the code is empty,
 * unknown (`"unknown"`, `"ZZ"`) or the country has no currency (`AQ`). Kept out
 * of the package barrel so the countries data stays out of client bundles.
 */
export const primaryCurrencyForCountry = (
  countryCode: string | null | undefined,
): string | null => {
  const code = countryCode?.trim().toUpperCase()
  if (!(code && code in countries)) {
    return null
  }
  return countries[code as keyof typeof countries].currency[0] ?? null
}
