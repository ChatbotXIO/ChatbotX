import { compactPhoneNumber } from "@chatbotx.io/flow-config"
import {
  AsYouType,
  type CountryCode,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js"

/** Digits with an optional leading `+` and the usual separators. */
const PHONE_LIKE = /^\+?[\d\s\-.()]*$/

/**
 * What the field shows: the picked country and the number typed next to it.
 * With a country the input holds only the national part (`15123456789` next
 * to 🇩🇪 +49); without one it holds the whole value (`+…`, or a `{{variable}}`).
 */
export type PhoneNumberParts = {
  country: CountryCode | null
  local: string
}

export const toDialCode = (country: CountryCode): string =>
  `+${getCountryCallingCode(country)}`

/**
 * Whether the picker can act on what is typed: empty, or typed like a phone
 * number. Free text, `tel:` and `{{variables}}` are left alone, so the picker
 * never turns arbitrary text into a dialable number.
 */
export const canPickCountry = (local: string): boolean => PHONE_LIKE.test(local)

/**
 * Splits a complete international number into its country and national part
 * (`+4915123456789` → 🇩🇪 `15123456789`). Anything else — unfinished, national,
 * a variable — stays whole with no country.
 */
export const splitPhoneNumber = (value: string): PhoneNumberParts => {
  const parsed = canPickCountry(value)
    ? parsePhoneNumberFromString(value)
    : undefined
  return parsed?.country && parsed.isValid()
    ? { country: parsed.country, local: parsed.nationalNumber }
    : { country: null, local: value }
}

/**
 * The value to store. A national number next to a country is read in that
 * country, so its trunk prefix is dropped the way the country does it
 * (`015123456789` in DE → `+4915123456789`); anything typed with its own `+`, or
 * holding a variable, is stored as typed.
 */
export const joinPhoneNumber = ({
  country,
  local,
}: PhoneNumberParts): string => {
  const typed = local.trim()
  const isNationalNumber =
    country !== null &&
    typed !== "" &&
    !typed.startsWith("+") &&
    canPickCountry(typed)
  if (!isNationalNumber) {
    return typed
  }
  const compact = compactPhoneNumber(typed)
  return (
    parsePhoneNumberFromString(compact, country)?.number ??
    `${toDialCode(country)}${compact}`
  )
}

/**
 * The parts to show instead when what was typed is a complete number under
 * another dial code — typed with `+`, or dialled the local international way
 * from the picked country (`011 44 …` from 🇺🇸, `0044 …` from 🇩🇪) — so the flag
 * always matches the stored number. Null when it already does, including a
 * country sharing the dial code (🇺🇸 / 🇨🇦 +1).
 */
export const moveToOwnCountry = (
  parts: PhoneNumberParts,
): PhoneNumberParts | null => {
  const actual = splitPhoneNumber(joinPhoneNumber(parts))
  if (!actual.country) {
    return null
  }
  const sameDialCode =
    parts.country !== null &&
    getCountryCallingCode(actual.country) ===
      getCountryCallingCode(parts.country)
  return sameDialCode ? null : actual
}

/** The dial code a `+…` value already starts with, even while it is incomplete. */
const getTypedCallingCode = (compact: string): string | undefined => {
  const formatter = new AsYouType()
  formatter.input(compact)
  return formatter.getCallingCode()
}

/**
 * The parts after the author picks `next` (or clears the country with null).
 * The number keeps everything after its old dial code, so switching
 * 🇩🇪 `15123456789` to 🇦🇹 gives 🇦🇹 `15123456789`; clearing the country shows the
 * full international number instead.
 */
export const changeCountry = (
  parts: PhoneNumberParts,
  next: CountryCode | null,
): PhoneNumberParts => {
  const full = compactPhoneNumber(joinPhoneNumber(parts))
  if (!next) {
    return { country: null, local: full }
  }
  if (!full.startsWith("+")) {
    // A national number is shown the way the picked country writes it.
    return {
      country: next,
      local: parsePhoneNumberFromString(full, next)?.nationalNumber ?? full,
    }
  }
  const typedCallingCode = getTypedCallingCode(full)
  return {
    country: next,
    local: typedCallingCode ? full.slice(`+${typedCallingCode}`.length) : "",
  }
}
