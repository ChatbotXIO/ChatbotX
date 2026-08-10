import { resolveLocale } from "@/i18n/config"
import { messagesByLocale } from "@/i18n/messages"

export const CONTACTS_IMPORT_TEMPLATE_FILENAME = "contacts-import-template.csv"

/**
 * The CSV columns for the contacts-import template: the union of every
 * channel's column-map targets (see `ContactImportColumnMap` and the worker's
 * `extractRowData`). WhatsApp does not read `contactId` (its identity comes
 * from the phone number) and only WhatsApp requires `phoneNumber`, but a
 * single combined template covers every channel's mapping dropdown.
 */
export const CONTACTS_IMPORT_TEMPLATE_COLUMNS = [
  "contactId",
  "phoneNumber",
  "email",
  "firstName",
  "lastName",
] as const

type ContactsImportTemplateColumn =
  (typeof CONTACTS_IMPORT_TEMPLATE_COLUMNS)[number]

// Only Vietnamese and English template headers are supported today.
const TEMPLATE_LOCALES = ["vi", "en"] as const
type TemplateLocale = (typeof TEMPLATE_LOCALES)[number]

const resolveTemplateLocale = (language: string): TemplateLocale =>
  resolveLocale(language) === "vi" ? "vi" : "en"

type FieldLabelMessages = {
  fields?: Partial<Record<ContactsImportTemplateColumn, { label?: string }>>
}

const resolveColumnLabel = (
  locale: TemplateLocale,
  column: ContactsImportTemplateColumn,
): string => {
  const localizedFields = (messagesByLocale[locale] as FieldLabelMessages)
    .fields
  const englishFields = (messagesByLocale.en as FieldLabelMessages).fields
  return (
    localizedFields?.[column]?.label ?? englishFields?.[column]?.label ?? column
  )
}

// A single filled-in row so users see the expected format for each column
// rather than an empty template.
const TEMPLATE_EXAMPLE_ROW: Record<
  TemplateLocale,
  Record<ContactsImportTemplateColumn, string>
> = {
  en: {
    contactId: "1234567890",
    phoneNumber: "+14155550100",
    email: "john.doe@example.com",
    firstName: "John",
    lastName: "Doe",
  },
  vi: {
    contactId: "1234567890",
    phoneNumber: "+84155550100",
    email: "an.nguyen@example.com",
    firstName: "An",
    lastName: "Nguyễn",
  },
}

// Always quotes and doubles embedded quotes, mirroring the `escapeCsvValue`
// convention used by the worker's CSV export handlers
// (apps/worker/src/default/handlers/export-contacts.ts and export-coupons.ts).
// There is no shared CSV package yet, so this mirrors — rather than imports —
// that convention for consistency across the codebase.
const escapeCsvValue = (value: string): string =>
  `"${value.replace(/"/g, '""')}"`

const buildCsvRow = (values: readonly string[]): string =>
  values.map(escapeCsvValue).join(",")

/**
 * Builds the contacts-import CSV template: a localized header row covering
 * every channel's import columns followed by one example data row, prefixed
 * with a UTF-8 BOM so spreadsheet apps (Excel, Sheets) render non-ASCII
 * labels correctly.
 */
export const buildContactsImportTemplateCsv = (language: string): string => {
  const locale = resolveTemplateLocale(language)
  const example = TEMPLATE_EXAMPLE_ROW[locale]

  const headerRow = buildCsvRow(
    CONTACTS_IMPORT_TEMPLATE_COLUMNS.map((column) =>
      resolveColumnLabel(locale, column),
    ),
  )
  const exampleRow = buildCsvRow(
    CONTACTS_IMPORT_TEMPLATE_COLUMNS.map((column) => example[column]),
  )

  return `﻿${headerRow}\n${exampleRow}\n`
}
