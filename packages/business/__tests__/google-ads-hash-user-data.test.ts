import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import {
  hashMatchingIdentifiers,
  normalizeEmail,
  normalizePhone,
} from "../src/google-ads/hash-user-data"

const SHA256_HEX = /^[0-9a-f]{64}$/

const sha = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex")

describe("normalizeEmail (Google rules)", () => {
  test.each([
    ["Cloudy.SanFrancisco+Shopping@Gmail.com", "cloudysanfrancisco@gmail.com"],
    ["  a.b.c@googlemail.com  ", "abc@googlemail.com"],
    ["A.B+tag@Example.COM", "a.b+tag@example.com"],
    ["first last@example.com", "firstlast@example.com"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected)
  })

  test.each([
    "",
    "no-at-sign",
    "a@@example.com",
    "a@b",
    "@example.com",
    "+tag@gmail.com",
    "...@gmail.com",
  ])("rejects %j", (raw) => {
    expect(normalizeEmail(raw)).toBeNull()
  })
})

describe("normalizePhone (E.164 with the +)", () => {
  test("does not pull a number out of surrounding prose", () => {
    expect(normalizePhone("Call my assistant at +14155552671")).toBeNull()
  })

  test("keeps the leading + and removes formatting", () => {
    expect(normalizePhone(" +1 (415) 555-2671 ")).toBe("+14155552671")
    expect(normalizePhone("+84 90 123 4567")).toBe("+84901234567")
  })

  test("a WhatsApp wa_id (international digits, no +) is read as international", () => {
    expect(normalizePhone("84901234567")).toBe("+84901234567")
    expect(normalizePhone(" 14155552671 ")).toBe("+14155552671")
  })

  test.each([
    ["a national number is not guessed from any locale", "0901234567"],
    ["digits that are not a valid international number", "12345678"],
    ["too long to be an international number", "8490123456789012"],
    ["a number with an extension", "+14155552671 ext. 12"],
    ["an impossible number", "+1 123"],
    ["text", "call me"],
    ["empty", ""],
  ])("rejects %s", (_label, raw) => {
    expect(normalizePhone(raw)).toBeNull()
  })
})

describe("hashMatchingIdentifiers", () => {
  test("is the lowercase hex SHA-256 of the normalised value", async () => {
    const hashed = await hashMatchingIdentifiers({
      email: "Cloudy.SanFrancisco+Shopping@Gmail.com",
      phone: "+1 415 555 2671",
    })

    expect(hashed).toEqual({
      emailAddress: sha("cloudysanfrancisco@gmail.com"),
      phoneNumber: sha("+14155552671"),
    })
    expect(hashed.emailAddress).toMatch(SHA256_HEX)
  })

  test("omits an identifier that is missing or cannot be normalised", async () => {
    expect(await hashMatchingIdentifiers({})).toEqual({})
    expect(
      await hashMatchingIdentifiers({ email: "nope", phone: "0901234567" }),
    ).toEqual({})
    expect(
      await hashMatchingIdentifiers({ email: null, phone: "+14155552671" }),
    ).toEqual({ phoneNumber: sha("+14155552671") })
  })

  test("the same contact value always hashes to the same digest", async () => {
    const first = await hashMatchingIdentifiers({ email: "A@b.co" })
    const second = await hashMatchingIdentifiers({ email: " a@B.co " })

    expect(first).toEqual(second)
  })
})
