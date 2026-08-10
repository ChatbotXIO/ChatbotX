// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  buildContactsImportTemplateCsv,
  CONTACTS_IMPORT_TEMPLATE_COLUMNS,
  CONTACTS_IMPORT_TEMPLATE_FILENAME,
} from "@/features/contacts/lib/contacts-import-template"

const UTF8_BOM = "﻿"

describe("buildContactsImportTemplateCsv", () => {
  const EN_TEMPLATE =
    '"Contact ID","Phone number","Email","First name","Last name"\n' +
    '"1234567890","+14155550100","john.doe@example.com","John","Doe"\n'
  const VI_TEMPLATE =
    '"ID Liên hệ","Số điện thoại","Email","Tên","Họ"\n' +
    '"1234567890","+84155550100","an.nguyen@example.com","An","Nguyễn"\n'

  test("returns quoted English headers and an example row with a UTF-8 BOM for the en language", () => {
    const csv = buildContactsImportTemplateCsv("en")

    expect(csv.startsWith(UTF8_BOM)).toBe(true)
    expect(csv.slice(UTF8_BOM.length)).toBe(EN_TEMPLATE)
  })

  test("returns quoted Vietnamese headers and example row for the vi language", () => {
    const csv = buildContactsImportTemplateCsv("vi")

    expect(csv.slice(UTF8_BOM.length)).toBe(VI_TEMPLATE)
  })

  test("falls back to the English template for any language other than vi", () => {
    const fr = buildContactsImportTemplateCsv("fr")
    const empty = buildContactsImportTemplateCsv("")

    expect(fr.slice(UTF8_BOM.length)).toBe(EN_TEMPLATE)
    expect(empty.slice(UTF8_BOM.length)).toBe(EN_TEMPLATE)
  })

  test("resolves regional variants to their base language", () => {
    // "vi-VN" must resolve like "vi"; en-* variants (and unmapped locales) fall
    // back to English — this guards the resolveLocale() delegation.
    const csv = buildContactsImportTemplateCsv("vi-VN")

    expect(csv.slice(UTF8_BOM.length)).toBe(VI_TEMPLATE)
  })

  test("emits a header row and exactly one example data row", () => {
    const csv = buildContactsImportTemplateCsv("en")
    const rows = csv.slice(UTF8_BOM.length).trimEnd().split("\n")

    expect(CONTACTS_IMPORT_TEMPLATE_COLUMNS).toEqual([
      "contactId",
      "phoneNumber",
      "email",
      "firstName",
      "lastName",
    ])
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.split(",")).toHaveLength(
        CONTACTS_IMPORT_TEMPLATE_COLUMNS.length,
      )
    }
  })

  test("exposes a stable download filename", () => {
    expect(CONTACTS_IMPORT_TEMPLATE_FILENAME).toBe(
      "contacts-import-template.csv",
    )
  })
})
