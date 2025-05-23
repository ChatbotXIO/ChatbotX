import type { Chatbot } from "@ahachat.ai/database/types"
import { getAllCountries, getAllTimezones } from "countries-and-timezones"

export const UNKNOWN_COUNTRY = "unknown"
export const allCountryCodes = [
  UNKNOWN_COUNTRY,
  ...Object.keys(getAllCountries()),
]
export const allCountryOptions = [
  { value: UNKNOWN_COUNTRY, label: "Unknown" },
  ...Object.values(getAllCountries()).map((country) => {
    return {
      value: country.id,
      label: country.name,
    }
  }),
]

export const allSupportedLanguages = [
  { label: "English", value: "en" },
  { label: "Tiếng Việt", value: "vi" },
]
export const allLanguageCodes = allSupportedLanguages.map(
  (language) => language.value,
)

export const allTimezoneOptions = Object.values(getAllTimezones()).map(
  (timezone) => {
    return {
      value: timezone.name,
      label: timezone.name,
    }
  },
)
export const allTimezoneCodes = Object.keys(getAllTimezones())

export type ChatboResource = Chatbot
