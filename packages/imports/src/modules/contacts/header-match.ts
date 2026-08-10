import {
  type ContactImportColumnMap,
  type ContactImportField,
  contactImportFields,
} from "@chatbotx.io/database/partials"

export const normalizeContactHeader = (raw: string): string =>
  raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

// Candidate headers per field, covering English, Vietnamese, our downloadable
// template labels, and common export column names. Values are matched after
// `normalizeContactHeader`, so accents/separators/casing here are irrelevant.
const HEADER_CANDIDATES = {
  contactId: ["contactid", "id", "idlienhe", "subscriberid", "psid", "uid"],
  phoneNumber: [
    "phonenumber",
    "phone",
    "mobile",
    "mobilephone",
    "tel",
    "telephone",
    "sodienthoai",
    "sdt",
    "dienthoai",
  ],
  email: ["email", "emailaddress", "mail", "diachiemail"],
  firstName: ["firstname", "givenname", "ten"],
  lastName: ["lastname", "surname", "familyname", "ho"],
} as const satisfies Record<ContactImportField, readonly string[]>

const normalizedCandidates = Object.fromEntries(
  contactImportFields.options.map((field) => [
    field,
    new Set(HEADER_CANDIDATES[field].map(normalizeContactHeader)),
  ]),
) as Record<ContactImportField, Set<string>>

export const matchContactImportHeaders = (
  headers: readonly string[],
): Partial<ContactImportColumnMap> => {
  const matchedColumns = new Set<string>()
  const result: Partial<ContactImportColumnMap> = {}

  for (const field of contactImportFields.options) {
    const match = headers.find(
      (header) =>
        !matchedColumns.has(header) &&
        normalizedCandidates[field].has(normalizeContactHeader(header)),
    )
    if (match) {
      result[field] = match
      matchedColumns.add(match)
    }
  }
  return result
}
