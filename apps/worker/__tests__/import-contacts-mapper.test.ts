import { extractRowData } from "@chatbotx.io/imports/modules/contacts"
import { describe, expect, test } from "vitest"

const columnMap = {
  contactId: "external_id",
  phoneNumber: "phone",
  email: "email",
  firstName: "first",
  lastName: "last",
}

describe("extractRowData", () => {
  test("maps standard columns and trims values", () => {
    const result = extractRowData(
      {
        external_id: "  ext-1 ",
        phone: " +1234567890 ",
        email: "  user@example.com ",
        first: "Ada ",
        last: " Lovelace",
      },
      columnMap,
    )

    expect(result).toEqual({
      externalId: "ext-1",
      phoneNumber: "+1234567890",
      email: "user@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      customFields: [],
    })
  })

  test("returns null when phone, email, and externalId are all missing", () => {
    const result = extractRowData(
      {
        first: "Ada",
        last: "Lovelace",
      },
      columnMap,
    )

    expect(result).toBeNull()
  })

  test("returns null when only blank strings present", () => {
    const result = extractRowData(
      {
        external_id: "   ",
        phone: "",
        email: "  ",
      },
      columnMap,
    )

    expect(result).toBeNull()
  })

  test("accepts row with only email", () => {
    const result = extractRowData(
      {
        email: "lone@example.com",
      },
      columnMap,
    )

    expect(result).not.toBeNull()
    expect(result?.email).toBe("lone@example.com")
    expect(result?.phoneNumber).toBeUndefined()
  })

  test("collects field mapping into customFields and skips blanks", () => {
    const result = extractRowData(
      {
        phone: "+15551234567",
        company: "Acme",
        role: "  ",
      },
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

  test("neutralizes CSV formula injection prefixes", () => {
    const result = extractRowData(
      {
        external_id: "=CMD()",
        first: "+DANGER",
        last: "@evil",
      },
      columnMap,
    )

    expect(result?.externalId).toBe("'=CMD()")
    expect(result?.firstName).toBe("'+DANGER")
    expect(result?.lastName).toBe("'@evil")
  })

  test("rejects invalid email and phone formats", () => {
    const result = extractRowData(
      {
        email: "not-an-email",
        phone: "abc",
      },
      columnMap,
    )

    expect(result).toBeNull()
  })

  test("ignores non-string row values", () => {
    const result = extractRowData(
      {
        phone: 12_345,
        email: null,
      },
      columnMap,
    )

    expect(result).toBeNull()
  })

  test("prepends country code to local phone numbers", () => {
    const result = extractRowData(
      { phone: "0901234567" },
      { phoneNumber: "phone" },
      undefined,
      { countryCode: "+84" },
    )

    expect(result?.phoneNumber).toBe("+84901234567")
  })

  test("keeps phone unchanged when already in E.164 format", () => {
    const result = extractRowData(
      { phone: "+15551234567" },
      { phoneNumber: "phone" },
      undefined,
      { countryCode: "+84" },
    )

    expect(result?.phoneNumber).toBe("+15551234567")
  })

  test("prepends country code without trimming leading digit", () => {
    const result = extractRowData(
      { phone: "5551234567" },
      { phoneNumber: "phone" },
      undefined,
      { countryCode: "+1" },
    )

    expect(result?.phoneNumber).toBe("+15551234567")
  })

  test("leaves phone untouched when no country code provided", () => {
    const result = extractRowData(
      { phone: "0901234567" },
      { phoneNumber: "phone" },
    )

    expect(result?.phoneNumber).toBe("0901234567")
  })
})
