import { getAllCountries, getAllTimezones } from "countries-and-timezones"
import { localeMeta, locales } from "@/i18n/config"

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

export const allSupportedLanguages = locales.map((locale) => ({
  label: localeMeta[locale].nativeLabel,
  value: locale,
}))
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

export const UNKNOWN_CONTINENT = "unknown"
export const allContinentOptions = [
  { value: UNKNOWN_CONTINENT, label: "Unknown" },
  { value: "AS", label: "Asia" },
  { value: "EU", label: "Europe" },
  { value: "AF", label: "Africa" },
  { value: "OC", label: "Australia" },
  { value: "NA", label: "North America" },
  { value: "SA", label: "South America" },
]
