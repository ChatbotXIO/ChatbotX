import {
  type ContactImportColumnMap,
  type ContactImportFieldMapping,
  channelTypes,
} from "@chatbotx.io/database/partials"
import { cleanEmail, cleanPhone, cleanText } from "@chatbotx.io/imports/parsers"
import { parsePhoneNumberFromString } from "libphonenumber-js"

const MAX_FIELD_LENGTH = 1000

export type ContactRow = {
  externalId?: string
  phoneNumber?: string
  email?: string
  firstName?: string
  lastName?: string
  customFields: Array<{ customFieldId: string; value: string }>
}

type MapRowOptions = {
  countryCode?: string
  channel?: string
}

// Normalize a phone number to E.164 using libphonenumber-js, which handles
// per-country trunk prefixes (leading 0), international prefixes (00/011), and
// validation. countryCode is the E.164 calling code (e.g. "+84") used as the
// default region for numbers that are not already "+"-prefixed. Invalid numbers
// return undefined.
const normalizePhone = (
  phone: string | undefined,
  countryCode: string | undefined,
): string | undefined => {
  if (!phone) {
    return
  }
  // "00" is the most common international call prefix; normalize it to "+" so
  // libphonenumber treats the number as already international.
  const normalized = phone.startsWith("00") ? `+${phone.slice(2)}` : phone
  const callingCode = countryCode?.startsWith("+")
    ? countryCode.slice(1)
    : countryCode

  const parsed = parsePhoneNumberFromString(
    normalized,
    callingCode ? { defaultCallingCode: callingCode } : undefined,
  )

  return parsed?.isValid() ? parsed.number : undefined
}

// WhatsApp identifies a contact by its wa_id — the E.164 digits with no
// leading "+". Strip it so the import sourceId matches the wa_id used by
// inbound webhooks and outbound sends.
const stripPlus = (phone: string | undefined): string | undefined =>
  phone?.startsWith("+") ? phone.slice(1) : phone

const pick = (
  row: Record<string, unknown>,
  column: string | undefined,
): unknown => (column ? row[column] : undefined)

const collectCustomFields = (
  row: Record<string, unknown>,
  fieldMapping: ContactImportFieldMapping | undefined,
): ContactRow["customFields"] => {
  const result: ContactRow["customFields"] = []
  for (const mapping of fieldMapping ?? []) {
    const value = cleanText(row[mapping.column], MAX_FIELD_LENGTH)
    if (value) {
      result.push({ customFieldId: mapping.customFieldId, value })
    }
  }
  return result
}

export const extractRowData = (
  row: Record<string, unknown>,
  columnMap: ContactImportColumnMap,
  fieldMapping?: ContactImportFieldMapping,
  options?: MapRowOptions,
): ContactRow | null => {
  const email = cleanEmail(pick(row, columnMap.email))
  const firstName = cleanText(pick(row, columnMap.firstName))
  const lastName = cleanText(pick(row, columnMap.lastName))
  const phoneNumber = normalizePhone(
    cleanPhone(pick(row, columnMap.phoneNumber)),
    options?.countryCode,
  )

  const externalId =
    options?.channel === channelTypes.enum.whatsapp
      ? stripPlus(phoneNumber)
      : cleanText(pick(row, columnMap.contactId))

  if (!(phoneNumber || email || externalId)) {
    return null
  }

  return {
    externalId,
    phoneNumber,
    email,
    firstName,
    lastName,
    customFields: collectCustomFields(row, fieldMapping),
  }
}
