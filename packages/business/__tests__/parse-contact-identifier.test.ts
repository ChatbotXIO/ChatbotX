import { describe, expect, test } from "vitest"
import { parseContactIdentifier } from "../src/contact/utils"

describe("parseContactIdentifier", () => {
  test("reads an id, an email and a phone with their prefixes", () => {
    expect(parseContactIdentifier("id:11731730122409244").where).toEqual({
      id: "11731730122409244",
    })
    expect(parseContactIdentifier("email:ada@example.com").where).toEqual({
      email: "ada@example.com",
    })
    expect(parseContactIdentifier("phone:+841234567890").where).toEqual({
      phoneNumber: "+841234567890",
    })
  })

  test.each([
    ["not digits", "id:abc"],
    ["longer than a bigint id", "id:9223372036854775808"],
    ["far longer than a bigint id", `id:${"9".repeat(40)}`],
  ])("an id that is %s is a not-found, never a value for the SQL compare", (_label, identifier) => {
    expect(() => parseContactIdentifier(identifier)).toThrow(
      "Contact not found",
    )
  })

  test("a prefix-less identifier is still refused", () => {
    expect(() => parseContactIdentifier("11731730122409244")).toThrow(
      "Invalid identifier format",
    )
  })
})
