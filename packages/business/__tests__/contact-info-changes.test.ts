import { describe, expect, test } from "vitest"
import { collectContactInfoChanges } from "../src/contact/contact-info-changes"

describe("collectContactInfoChanges", () => {
  test("reports a phone number that was just set", () => {
    expect(
      collectContactInfoChanges(
        { phoneNumber: null, email: null },
        { phoneNumber: "+84912345678", email: null },
      ),
    ).toEqual([{ infoType: "phone", oldValue: null, newValue: "+84912345678" }])
  })

  test("reports both fields when phone and email change together", () => {
    expect(
      collectContactInfoChanges(
        { phoneNumber: "+84900000000", email: "old@example.com" },
        { phoneNumber: "+84912345678", email: "new@example.com" },
      ),
    ).toEqual([
      {
        infoType: "phone",
        oldValue: "+84900000000",
        newValue: "+84912345678",
      },
      {
        infoType: "email",
        oldValue: "old@example.com",
        newValue: "new@example.com",
      },
    ])
  })

  test("ignores unchanged values and whitespace-only differences", () => {
    expect(
      collectContactInfoChanges(
        { phoneNumber: "+84912345678", email: "same@example.com" },
        { phoneNumber: "+84912345678", email: " same@example.com " },
      ),
    ).toEqual([])
  })

  test("does not treat clearing a value as an update", () => {
    expect(
      collectContactInfoChanges(
        { phoneNumber: "+84912345678", email: "old@example.com" },
        { phoneNumber: null, email: "" },
      ),
    ).toEqual([])
  })
})
