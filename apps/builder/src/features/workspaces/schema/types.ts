import { getAllCountries, getAllTimezones } from "countries-and-timezones"
import { continents } from "countries-list"

export const UNKNOWN_COUNTRY = "unknown"
export const allCountryCodes = [
  UNKNOWN_COUNTRY,
  ...Object.keys(getAllCountries()),
]
export const allCountryOptions = [
  { value: UNKNOWN_COUNTRY, label: "Unknown" },
  ...Object.values(getAllCountries()).map((country) => ({
    value: country.id,
    label: country.name,
  })),
]

export const allSupportedLanguages = [
  { label: "English", value: "en" },
  { label: "Tiếng Việt", value: "vi" },
]
export const allLanguageCodes = allSupportedLanguages.map(
  (language) => language.value,
)

export const allTimezoneOptions = Object.values(getAllTimezones()).map(
  (timezone) => ({
    value: timezone.name,
    label: timezone.name,
  }),
)
export const allTimezoneCodes = Object.keys(getAllTimezones())

export const allContinentOptions = Object.entries(continents).map(
  ([code, name]) => ({
    value: code,
    label: name,
  }),
)
