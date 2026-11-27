import { describe, expect, test } from "vitest"
import { contactDisplayName } from "../src/features/contacts/lib/contact-display-name"

describe("contactDisplayName", () => {
  test("prefers the name, then email, then phone", () => {
    expect(
      contactDisplayName({
        fullName: "Ann",
        email: "a@x.io",
        phoneNumber: "1",
      }),
    ).toBe("Ann")
    expect(contactDisplayName({ fullName: null, email: "a@x.io" })).toBe(
      "a@x.io",
    )
    expect(contactDisplayName({ phoneNumber: "+84 90" })).toBe("+84 90")
  })

  test("skips blank values instead of showing them", () => {
    expect(
      contactDisplayName({ fullName: "  ", email: "", phoneNumber: "0909" }),
    ).toBe("0909")
  })

  test("returns null when nothing identifies the contact", () => {
    expect(contactDisplayName({ fullName: " ", email: null })).toBeNull()
    expect(contactDisplayName(null)).toBeNull()
  })
})
