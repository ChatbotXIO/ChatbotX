import type {
  ContactImportColumnMap,
  ContactImportFieldMapping,
} from "@chatbotx.io/database/partials"
import { cleanEmail, cleanPhone, cleanText } from "../../parsers/cell"

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
}

const applyCountryCode = (
  phone: string | undefined,
  countryCode: string | undefined,
): string | undefined => {
  if (!phone) {
    return
  }
  if (phone.startsWith("+")) {
    return phone
  }
  if (!countryCode) {
    return phone
  }
  const local = phone.startsWith("0") ? phone.slice(1) : phone
  return `${countryCode}${local}`
}

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
  const externalId = cleanText(pick(row, columnMap.contactId))
  const email = cleanEmail(pick(row, columnMap.email))
  const firstName = cleanText(pick(row, columnMap.firstName))
  const lastName = cleanText(pick(row, columnMap.lastName))
  const phoneNumber = applyCountryCode(
    cleanPhone(pick(row, columnMap.phoneNumber)),
    options?.countryCode,
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
    customFields: collectCustomFields(row, fieldMapping),
  }
}
