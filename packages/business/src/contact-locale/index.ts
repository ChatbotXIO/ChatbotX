import { getTimezoneOffset } from "date-fns-tz"
import { parsePhoneNumberFromString } from "libphonenumber-js"
import { supportedContactLanguages } from "./languages"
import {
  offsetToTimezoneMap,
  phoneCountryProfiles,
  singleZoneCountryTimezones,
} from "./timezones"

export type ContactLocaleProfile = {
  locale?: string | null
  language?: string | null
  timezone?: string | null
}

const LOCALE_SEPARATOR_RE = /[-_]/
const OFFSET_RE = /^([+-]?)(\d{1,2})(?::?([0-5]\d))?$/

export { contactLanguageOptions } from "./languages"
export { contactLocaleOptions } from "./locales"
export { contactTimezoneOptions } from "./timezones"

export const normalizeLocale = (
  raw: string | null | undefined,
): string | undefined => {
  const trimmed = raw?.trim()
  if (!trimmed) {
    return
  }

  const [language, region, ...rest] = trimmed.split(LOCALE_SEPARATOR_RE)
  if (!(language && region)) {
    return trimmed.toLowerCase()
  }

  return [
    language.toLowerCase(),
    region.toUpperCase(),
    ...rest.map((part) => part.toUpperCase()),
  ].join("_")
}

export const languageFromLocale = (
  locale: string | null | undefined,
): string | undefined => {
  const normalized = normalizeLocale(locale)
  const language = normalized?.split(LOCALE_SEPARATOR_RE)[0]?.toLowerCase()
  return language || undefined
}

export const normalizeLanguage = (
  language: string | null | undefined,
): string | undefined => {
  const normalized = languageFromLocale(language)
  if (!normalized) {
    return
  }
  return supportedContactLanguages.has(normalized) ? normalized : undefined
}

export const timezoneFromLocaleRegion = (
  locale: string | null | undefined,
): string | null => {
  const normalized = normalizeLocale(locale)
  const region = normalized?.split("_")[1]?.toUpperCase()
  return region ? (singleZoneCountryTimezones[region] ?? null) : null
}

const normalizeOffsetKey = (value: string): string | null => {
  const trimmed = value.trim()
  const match = OFFSET_RE.exec(trimmed)
  if (!match) {
    return null
  }

  const sign = match[1] === "-" ? -1 : 1
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? "0")
  if (!(Number.isFinite(hours) && Number.isFinite(minutes))) {
    return null
  }

  const offset = sign * (hours + minutes / 60)
  return Number.isInteger(offset) ? String(offset) : String(offset)
}

export const normalizeStoredTimezone = (
  value: string | null | undefined,
): string | null => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  const offsetKey = normalizeOffsetKey(trimmed)
  return offsetKey ? (offsetToTimezoneMap[offsetKey] ?? trimmed) : trimmed
}

export const offsetFromStoredTimezone = (
  value: string | null | undefined,
): string | null => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }

  const offsetKey = normalizeOffsetKey(trimmed)
  if (offsetKey) {
    const offset = Number(offsetKey)
    return offset > 0 ? `+${offsetKey}` : offsetKey
  }

  try {
    const offsetMs = getTimezoneOffset(trimmed, new Date())
    if (!Number.isFinite(offsetMs)) {
      return null
    }
    const offsetHours = offsetMs / 60 / 60 / 1000
    const normalized = Number.isInteger(offsetHours)
      ? String(offsetHours)
      : String(offsetHours)
    return offsetHours > 0 ? `+${normalized}` : normalized
  } catch {
    return null
  }
}

export const profileFromPhoneNumber = (
  phone: string | null | undefined,
): ContactLocaleProfile | null => {
  const trimmed = phone?.trim()
  if (!trimmed) {
    return null
  }

  const parsed = parsePhoneNumberFromString(
    trimmed.startsWith("+") ? trimmed : `+${trimmed}`,
  )
  const country = parsed?.country
  if (!country) {
    return null
  }

  const profile = phoneCountryProfiles[country]
  if (!profile) {
    return null
  }

  return {
    locale: profile.locale,
    language: languageFromLocale(profile.locale),
    timezone: profile.timezone,
  }
}

export const finalizeContactProfile = (
  profile: ContactLocaleProfile,
  options: { phoneHint?: string | null; fallbackLocale?: string } = {},
): ContactLocaleProfile => {
  const normalizedLocale = normalizeLocale(profile.locale)
  const normalizedTimezone = normalizeStoredTimezone(profile.timezone)
  const phoneProfile = profileFromPhoneNumber(options.phoneHint)

  const locale =
    normalizedLocale ??
    phoneProfile?.locale ??
    normalizeLocale(options.fallbackLocale)
  const timezone =
    normalizedTimezone ??
    phoneProfile?.timezone ??
    timezoneFromLocaleRegion(locale)
  const language =
    normalizeLanguage(profile.language) ??
    normalizeLanguage(locale) ??
    normalizeLanguage(phoneProfile?.language)

  return {
    locale,
    language,
    timezone: timezone ?? undefined,
  }
}
