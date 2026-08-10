// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  buildContactsImportTemplateCsv,
  CONTACTS_IMPORT_TEMPLATE_COLUMNS,
  CONTACTS_IMPORT_TEMPLATE_FILENAME,
} from "@/features/contacts/lib/contacts-import-template"

const UTF8_BOM = "﻿"

describe("buildContactsImportTemplateCsv", () => {
  test("returns quoted English headers with a UTF-8 BOM for the en language", () => {
    const csv = buildContactsImportTemplateCsv("en")

    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(csv.slice(UTF8_BOM.length)).toBe(
      '"Contact ID","Phone number","Email","First name","Last name"\n',
    )
  })

  test("returns quoted Vietnamese headers for the vi language", () => {
    const csv = buildContactsImportTemplateCsv("vi")

    expect(csv.slice(UTF8_BOM.length)).toBe(
      '"ID Liên hệ","Số điện thoại","Email","Tên","Họ"\n',
    )
  })

  test("falls back to English headers for any language other than vi", () => {
    const fr = buildContactsImportTemplateCsv("fr")
    const empty = buildContactsImportTemplateCsv("")

    const englishHeaderRow =
      '"Contact ID","Phone number","Email","First name","Last name"\n'
    expect(fr.slice(UTF8_BOM.length)).toBe(englishHeaderRow)
    expect(empty.slice(UTF8_BOM.length)).toBe(englishHeaderRow)
  })

  test("resolves regional variants to their base language", () => {
    // "vi-VN" must resolve like "vi"; en-* variants (and unmapped locales) fall
    // back to English — this guards the resolveLocale() delegation.
    const csv = buildContactsImportTemplateCsv("vi-VN")

    expect(csv.slice(UTF8_BOM.length)).toBe(
      '"ID Liên hệ","Số điện thoại","Email","Tên","Họ"\n',
    )
  })

  test("emits exactly the documented column count and order", () => {
    const csv = buildContactsImportTemplateCsv("en")
    const [headerLine] = csv.slice(UTF8_BOM.length).trimEnd().split("\n")

    expect(CONTACTS_IMPORT_TEMPLATE_COLUMNS).toEqual([
      "contactId",
      "phoneNumber",
      "email",
      "firstName",
      "lastName",
    ])
    expect(headerLine.split(",")).toHaveLength(
      CONTACTS_IMPORT_TEMPLATE_COLUMNS.length,
    )
  })

  test("exposes a stable download filename", () => {
    expect(CONTACTS_IMPORT_TEMPLATE_FILENAME).toBe(
      "contacts-import-template.csv",
    )
  })
})
