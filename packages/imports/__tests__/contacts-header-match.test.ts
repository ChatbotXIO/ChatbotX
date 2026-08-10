import { describe, expect, test } from "vitest"
import {
  matchContactImportHeaders,
  normalizeContactHeader,
} from "../src/modules/contacts/header-match"

describe("contact import header matching", () => {
  test.each([
    ["Contact ID", "contactId"],
    ["ID Liên hệ", "contactId"],
    ["Phone number", "phoneNumber"],
    ["Số điện thoại", "phoneNumber"],
    ["SĐT", "phoneNumber"],
    ["Email", "email"],
    ["E-mail Address", "email"],
    ["First name", "firstName"],
    ["Tên", "firstName"],
    ["Last name", "lastName"],
    ["Họ", "lastName"],
  ])("maps %s to %s", (header, field) => {
    expect(matchContactImportHeaders([header])).toHaveProperty(field, header)
  })

  test("maps a full localized template row to every field", () => {
    expect(
      matchContactImportHeaders([
        "ID Liên hệ",
        "Số điện thoại",
        "Email",
        "Tên",
        "Họ",
      ]),
    ).toEqual({
      contactId: "ID Liên hệ",
      phoneNumber: "Số điện thoại",
      email: "Email",
      firstName: "Tên",
      lastName: "Họ",
    })
  })

  test("keeps first and last name headers from colliding", () => {
    expect(matchContactImportHeaders(["Last name", "First name"])).toEqual({
      firstName: "First name",
      lastName: "Last name",
    })
  })

  test("does not guess an unsupported header", () => {
    expect(matchContactImportHeaders(["Ghi chú", "Extension"])).toEqual({})
  })

  test("returns nothing for an empty header list", () => {
    expect(matchContactImportHeaders([])).toEqual({})
  })

  test("uses a duplicate source header only once", () => {
    const mapping = matchContactImportHeaders(["Email", "Email"])
    expect(Object.values(mapping)).toEqual(["Email"])
  })

  test.each([
    ["đ", "d"],
    ["Đ", "d"],
    ["Số điện thoại", "sodienthoai"],
  ])("normalizes Vietnamese variants in %s", (header, normalized) => {
    expect(normalizeContactHeader(header)).toBe(normalized)
  })
})
