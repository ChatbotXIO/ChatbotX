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
  // Alternate stable channel-scoped user id (e.g. a WhatsApp BSUID), carried
  // from the mapped column. Only populated for whatsapp — see
  // `resolveContactIdentity`.
  sourceUserId?: string
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

/**
 * Reads one mapped column's cleaned value exactly the way the custom-field
 * mapping does — used by the handler to collect bot-field-mapped values.
 */
export const readMappedColumnValue = (
  row: Record<string, unknown>,
  column: string,
): string | undefined => cleanText(row[column], MAX_FIELD_LENGTH)

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

type ContactIdentity = {
  externalId: string | undefined
  sourceUserId: string | undefined
}

// WhatsApp identity ladder, mirroring the live-webhook fallback rule: the
// stripped phone is the primary externalId; the mapped scoped user id (e.g. a
// WhatsApp BSUID) is the fallback identity when the phone is absent or
// invalid, and is always carried on the row so a phone-keyed contact can be
// backfilled with it at creation.
const resolveWhatsappIdentity = (
  row: Record<string, unknown>,
  columnMap: ContactImportColumnMap,
  phoneNumber: string | undefined,
): ContactIdentity => {
  const sourceUserId = cleanText(pick(row, columnMap.sourceUserId))
  return {
    externalId: stripPlus(phoneNumber) ?? sourceUserId,
    sourceUserId,
  }
}

// Non-whatsapp channels keep today's behavior: externalId comes from the
// mapped contactId column, and sourceUserId is never extracted — the partial
// unique index (inboxId, sourceUserId) would let arbitrary mapped data
// silently dedup distinct contacts on channels with no scoped-id concept.
const resolveDefaultIdentity = (
  row: Record<string, unknown>,
  columnMap: ContactImportColumnMap,
): ContactIdentity => ({
  externalId: cleanText(pick(row, columnMap.contactId)),
  sourceUserId: undefined,
})

const resolveContactIdentity = (
  row: Record<string, unknown>,
  columnMap: ContactImportColumnMap,
  phoneNumber: string | undefined,
  channel: string | undefined,
): ContactIdentity =>
  channel === channelTypes.enum.whatsapp
    ? resolveWhatsappIdentity(row, columnMap, phoneNumber)
    : resolveDefaultIdentity(row, columnMap)

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

  const { externalId, sourceUserId } = resolveContactIdentity(
    row,
    columnMap,
    phoneNumber,
    options?.channel,
  )

  if (!(phoneNumber || email || externalId)) {
    return null
  }

  return {
    externalId,
    phoneNumber,
    email,
    firstName,
    lastName,
    sourceUserId,
    customFields: collectCustomFields(row, fieldMapping),
  }
}
