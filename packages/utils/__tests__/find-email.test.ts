import { describe, expect, test } from "vitest"
import { EMAIL_REGEX, findEmail } from "../src/find-email"

describe("findEmail", () => {
  test("returns the first address written in the text, as typed", () => {
    expect(findEmail("mail Binh.Tran@Shop.vn or b@x.io")).toBe(
      "Binh.Tran@Shop.vn",
    )
  })

  test("returns null when the text holds no address", () => {
    expect(findEmail("call me on 0901234567")).toBeNull()
    expect(findEmail("")).toBeNull()
  })

  test("exposes the matcher the contact extractor shares", () => {
    expect("a@b.co".match(EMAIL_REGEX)?.[0]).toBe("a@b.co")
  })
})
