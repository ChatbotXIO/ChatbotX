import { describe, expect, test } from "vitest"
import { hashContactUserData } from "../hash-user-data"

const SHA256_HEX_RE = /^[a-f0-9]{64}$/

// Vectors below are taken from Meta's published Customer Information
// Parameters doc test vectors (em/ph/fn) — cross-checked independently with
// `shasum -a 256`, not hand-computed/paraphrased:
//   em  "John_Smith@gmail.com" -> normalized "john_smith@gmail.com"
//       -> 62a14e44f765419d10fea99367361a727c12365e2520f32218d505ed9aa0f62f
//   ph  "+16505551212" -> normalized "16505551212"
//       -> e323ec626319ca94ee8bff2e4c87cf613be6ea19919ed1364124e16807ab3176
//   fn  "Mary" -> normalized "mary"
//       -> 6915771be1c5aa0c886870b6951b03d7eafc121fea0e80a5ea83beb7c449f4ec
// The multi-word name vectors (fn "John Smith" -> "johnsmith", ln
// "Mary Jane"/"Smith-Jones" -> "maryjane"/"smithjones") replicate the exact
// normalization behavior verified against capi-param-builder's own
// `tests/nameUtil.test.js` fixtures, then hashed with `shasum -a 256` — same
// derivation method, not hand-guessed.

describe("hashContactUserData", () => {
  test("hashes email using Meta's official test vector", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      email: "John_Smith@gmail.com",
    })

    expect(result.em).toEqual([
      "62a14e44f765419d10fea99367361a727c12365e2520f32218d505ed9aa0f62f",
    ])
  })

  test("hashes a valid E.164-parseable phone using Meta's official test vector", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      phoneNumber: "+16505551212",
    })

    expect(result.ph).toEqual([
      "e323ec626319ca94ee8bff2e4c87cf613be6ea19919ed1364124e16807ab3176",
    ])
  })

  test("hashes first name using Meta's official test vector", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      firstName: "Mary",
    })

    expect(result.fn).toEqual([
      "6915771be1c5aa0c886870b6951b03d7eafc121fea0e80a5ea83beb7c449f4ec",
    ])
  })

  test("strips interior whitespace (not just trims) for multi-word first names", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      firstName: "John Smith",
    })

    // "John Smith" -> "johnsmith" (space removed entirely, per the official
    // capi-param-builder name-normalization rule — NOT a plain trim).
    expect(result.fn).toEqual([
      "45358dd8587f2de278ec7411a560bae78720c13aaa369d0cd95b67715adb445c",
    ])
  })

  test("strips interior whitespace and punctuation for multi-word last names", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      lastName: "Mary Jane",
    })

    expect(result.ln).toEqual([
      "f08f448a5e7a9dc3619bb7c129f6a7d5fc6af002cea17ad71dfdc1c68f4d4e0e",
    ])
  })

  test("strips punctuation (hyphen) for hyphenated last names", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      lastName: "Smith-Jones",
    })

    expect(result.ln).toEqual([
      "6a77f47e3dec33252edbebb457d65e90501b643806c50cf8d6c3e2bd9cb74681",
    ])
  })

  test("hashes the opaque contact id, unnormalized, as external_id", async () => {
    const result = await hashContactUserData({ id: "e2e-contact-42" })

    expect(result.external_id).toEqual([
      "74c1082af713785f2f4ada1c8e966a8d46a96563fb52363a27ca03cb0b37bbb1",
    ])
  })

  test("omits ph for a phone that cannot be parsed as a valid number", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      // Looks phone-shaped but is not a real, valid E.164 number — must be
      // omitted, never hashed as a best-effort guess (a wrong hash can
      // collide with someone else's real value).
      phoneNumber: "12345",
    })

    expect(result.ph).toBeUndefined()
  })

  test("omits ph for an unparseable phone string without throwing", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      phoneNumber: "not-a-phone",
    })

    expect(result.ph).toBeUndefined()
  })

  test("omits em for a malformed email address", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      email: "not-an-email",
    })

    expect(result.em).toBeUndefined()
  })

  test("only includes present fields, plus external_id always", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      email: "john_smith@gmail.com",
    })

    expect(Object.keys(result).sort()).toEqual(["em", "external_id"])
  })

  test("every present field is an array with exactly one hash string", async () => {
    const result = await hashContactUserData({
      id: "contact-1",
      email: "john_smith@gmail.com",
      firstName: "Mary",
      lastName: "Jane",
      phoneNumber: "+16505551212",
    })

    for (const value of Object.values(result)) {
      expect(value).toHaveLength(1)
      expect(value?.[0]).toMatch(SHA256_HEX_RE)
    }
  })

  test("never leaks plaintext PII into the hashed output", async () => {
    const contact = {
      id: "contact-1",
      email: "john_smith@gmail.com",
      firstName: "Mary",
      lastName: "Jane",
      phoneNumber: "+16505551212",
    }
    const result = await hashContactUserData(contact)
    const serialized = JSON.stringify(result)

    expect(serialized).not.toContain(contact.email)
    expect(serialized).not.toContain(contact.firstName)
    expect(serialized).not.toContain(contact.lastName)
    expect(serialized).not.toContain(contact.phoneNumber)
    expect(serialized).not.toContain("6505551212")
  })
})
