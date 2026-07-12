import { contactLanguageOptions } from "./languages"
import { phoneCountryProfiles } from "./timezones"

export type ContactLocaleOption = {
  value: string
  label: string
}

const contactLocaleValues = new Set([
  ...contactLanguageOptions.map((option) => option.locale),
  ...Object.values(phoneCountryProfiles).map((profile) => profile.locale),
])

export const contactLocaleOptions = Array.from(contactLocaleValues)
  .sort()
  .map((locale) => ({ value: locale, label: locale }))
