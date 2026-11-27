import { describe, expect, test } from "vitest"
import {
  detectContactInfoTypes,
  toContactInfoCaptureTypes,
} from "../src/contact/detect-contact-info"

const DIGITS_OR_AT = /\d{6}|@/

describe("detectContactInfoTypes", () => {
  test("an internationally formatted phone needs no country", () => {
    expect(detectContactInfoTypes("call +84901234567", null)).toEqual(["phone"])
  })

  test("a national phone matches with the workspace target country, and falls back to the extractor's default regions without one", () => {
    expect(detectContactInfoTypes("0901234567", "VN")).toEqual(["phone"])
    expect(detectContactInfoTypes("0901234567", undefined)).toEqual(["phone"])
  })

  test("an email", () => {
    expect(detectContactInfoTypes("me: A@Example.com", "VN")).toEqual(["email"])
  })

  test("both kinds, phone first", () => {
    expect(
      detectContactInfoTypes("+84901234567 and a@example.com", "VN"),
    ).toEqual(["phone", "email"])
  })

  test("none, empty, missing and too-short text", () => {
    expect(detectContactInfoTypes("hello there friend", "VN")).toEqual([])
    expect(detectContactInfoTypes("", "VN")).toEqual([])
    expect(detectContactInfoTypes(null, "VN")).toEqual([])
    expect(detectContactInfoTypes(undefined, "VN")).toEqual([])
    expect(detectContactInfoTypes("ok", "VN")).toEqual([])
  })

  test("never returns the values", () => {
    expect(
      JSON.stringify(detectContactInfoTypes("+84901234567 a@b.co", "VN")),
    ).not.toMatch(DIGITS_OR_AT)
  })
})

describe("toContactInfoCaptureTypes", () => {
  test("maps an extractor result to kinds only", () => {
    expect(toContactInfoCaptureTypes({})).toEqual([])
    expect(toContactInfoCaptureTypes({ phoneNumber: "+1" })).toEqual(["phone"])
    expect(
      toContactInfoCaptureTypes({ phoneNumber: "+1", email: "a@b.co" }),
    ).toEqual(["phone", "email"])
  })
})
