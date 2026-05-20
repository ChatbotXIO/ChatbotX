import type { ContactImportColumnMap } from "@chatbotx.io/database/partials"
import { describe, expect, it } from "vitest"
import { extractRowData } from "../src/default/handlers/imports/handler/contacts/extractor"

const columnMap: ContactImportColumnMap = {
  contactId: "id",
  phoneNumber: "phone",
  email: "email",
  firstName: "first",
  lastName: "last",
}

const phoneOf = (phone: string, countryCode?: string): string | undefined =>
  extractRowData({ phone }, columnMap, undefined, { countryCode })?.phoneNumber

describe("extractRowData phone normalization", () => {
  it("strips the trunk 0 and applies the calling code (VN)", () => {
    expect(phoneOf("0912345678", "+84")).toBe("+84912345678")
  })

  it("retains the leading 0 for countries that keep it (IT landline)", () => {
    expect(phoneOf("0612345678", "+39")).toBe("+390612345678")
  })

  it("normalizes the 00 international prefix", () => {
    expect(phoneOf("0084912345678", "+84")).toBe("+84912345678")
  })

  it("passes through an already + -prefixed number without a country code", () => {
    expect(phoneOf("+390612345678")).toBe("+390612345678")
  })

  it("ignores the country code when the number is already international", () => {
    expect(phoneOf("+84912345678", "+1")).toBe("+84912345678")
  })

  it("accepts spaces and dashes in the input", () => {
    expect(phoneOf("091-234 5678", "+84")).toBe("+84912345678")
  })

  it("returns undefined for an invalid number", () => {
    expect(phoneOf("123", "+84")).toBeUndefined()
  })

  it("returns undefined for a local number with no country code", () => {
    expect(phoneOf("0912345678")).toBeUndefined()
  })

  it("keeps the row when phone is invalid but another field is present", () => {
    const row = extractRowData(
      { phone: "123", email: "a@b.com" },
      columnMap,
      undefined,
      { countryCode: "+84" },
    )
    expect(row?.phoneNumber).toBeUndefined()
    expect(row?.email).toBe("a@b.com")
  })

  it("drops the row when phone is invalid and no other field is present", () => {
    const row = extractRowData({ phone: "123" }, columnMap, undefined, {
      countryCode: "+84",
    })
    expect(row).toBeNull()
  })
})

describe("extractRowData externalId resolution", () => {
  it("uses the contactId column as externalId for non-whatsapp channels", () => {
    const row = extractRowData(
      { id: "ext-1", phone: "+84912345678" },
      columnMap,
    )
    expect(row?.externalId).toBe("ext-1")
    expect(row?.phoneNumber).toBe("+84912345678")
  })

  it("derives externalId from the phone digits (no +) for whatsapp", () => {
    const row = extractRowData(
      { id: "ext-1", phone: "+84912345678" },
      columnMap,
      undefined,
      { channel: "whatsapp" },
    )
    expect(row?.externalId).toBe("84912345678")
    expect(row?.phoneNumber).toBe("+84912345678")
  })

  it("derives the whatsapp externalId from a normalized leading-zero phone", () => {
    const row = extractRowData({ phone: "0912345678" }, columnMap, undefined, {
      channel: "whatsapp",
      countryCode: "+84",
    })
    expect(row?.externalId).toBe("84912345678")
    expect(row?.phoneNumber).toBe("+84912345678")
  })

  it("drops a whatsapp row when the phone is invalid", () => {
    const row = extractRowData({ phone: "123" }, columnMap, undefined, {
      channel: "whatsapp",
      countryCode: "+84",
    })
    expect(row).toBeNull()
  })
})

describe("extractRowData field handling", () => {
  it("maps standard columns and trims values", () => {
    const result = extractRowData(
      {
        id: "  ext-1 ",
        phone: " +84912345678 ",
        email: "  user@example.com ",
        first: "Ada ",
        last: " Lovelace",
      },
      columnMap,
    )

    expect(result).toEqual({
      externalId: "ext-1",
      phoneNumber: "+84912345678",
      email: "user@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      customFields: [],
    })
  })

  it("returns null when only blank strings are present", () => {
    const result = extractRowData(
      { id: "   ", phone: "", email: "  " },
      columnMap,
    )
    expect(result).toBeNull()
  })

  it("accepts a row with only an email", () => {
    const result = extractRowData({ email: "lone@example.com" }, columnMap)
    expect(result?.email).toBe("lone@example.com")
    expect(result?.phoneNumber).toBeUndefined()
  })

  it("collects field mapping into customFields and skips blanks", () => {
    const result = extractRowData(
      { phone: "+84912345678", company: "Acme", role: "  " },
      { phoneNumber: "phone" },
      [
        { column: "company", customFieldId: "10" },
        { column: "role", customFieldId: "11" },
        { column: "missing", customFieldId: "12" },
      ],
    )

    expect(result?.customFields).toEqual([
      { customFieldId: "10", value: "Acme" },
    ])
  })

  it("stores values raw without formula escaping (escaping happens at export)", () => {
    const result = extractRowData(
      { id: "=CMD()", first: "+DANGER", last: "@evil" },
      columnMap,
    )

    expect(result?.externalId).toBe("=CMD()")
    expect(result?.firstName).toBe("+DANGER")
    expect(result?.lastName).toBe("@evil")
  })

  it("ignores non-string row values", () => {
    const result = extractRowData({ phone: 12_345, email: null }, columnMap)
    expect(result).toBeNull()
  })
})
