import { describe, expect, test, vi } from "vitest"
import { normalizeCustomFieldValueForStorage } from "../src/contact-custom-field/normalize"

// Full matrix for the RUNTIME_COERCE_HANDLERS registry added to
// `normalizeCustomFieldValueForStorage` (contact-custom-field/normalize.ts).
// Boolean/number are the two types that gained real behavior this phase;
// text/email/phoneNumber must stay byte-identical (raw passthrough) and
// temporal must stay byte-identical (already covered exhaustively by
// contact-custom-field-normalize.test.ts) — this file only re-pins temporal
// with one smoke case to prove the new non-temporal branch didn't disturb it.

const resolver = () => Promise.resolve("UTC")

describe("runtime coercion — boolean (generous, never throws)", () => {
  test.each([
    ["0", "false"],
    ["1", "true"],
    ["true", "true"],
    ["TRUE", "true"],
    ["False", "false"],
    ["FALSE", "false"],
    ["yes", "true"],
    ["YES", "true"],
    ["no", "false"],
    ["on", "true"],
    ["off", "false"],
    ["t", "true"],
    ["f", "false"],
    ["y", "true"],
    ["n", "false"],
    ["  TRUE  ", "true"],
    // Unrecognized non-empty text coerces to true (JS-truthiness semantics),
    // never throws — a chatbot flow must not crash on arbitrary user text.
    ["12313", "true"],
    ["maybe", "true"],
  ])("coerces %s -> %s", async (raw, expected) => {
    await expect(
      normalizeCustomFieldValueForStorage({
        type: "boolean",
        value: raw,
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe(expected)
  })

  test.each([
    "",
    "   ",
  ])("blank boolean %j stays empty — means unset, not false (symmetric with number)", async (raw) => {
    await expect(
      normalizeCustomFieldValueForStorage({
        type: "boolean",
        value: raw,
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe("")
  })

  test("never touches the source-timezone resolver", async () => {
    const spy = vi.fn(resolver)
    await normalizeCustomFieldValueForStorage({
      type: "boolean",
      value: "anything",
      resolveSourceTimezone: spy,
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("runtime coercion — number (validate-or-throw, canonical output)", () => {
  test.each([
    ["7", "7"],
    ["007", "7"],
    [" 1.5 ", "1.5"],
    ["1e3", "1000"],
    ["-2.5", "-2.5"],
    ["0", "0"],
    // Widened vocabulary via `canonicalNumberLiteral` (JS `Number()`
    // semantics) — deliberate, mirrors the boolean-literal widening.
    ["+1", "1"],
    ["1.", "1"],
    ["0x10", "16"],
  ])("normalizes %s -> %s", async (raw, expected) => {
    await expect(
      normalizeCustomFieldValueForStorage({
        type: "number",
        value: raw,
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe(expected)
  })

  test("blank (or whitespace-only) stays empty — means unset, not invalid", async () => {
    await expect(
      normalizeCustomFieldValueForStorage({
        type: "number",
        value: "",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe("")

    await expect(
      normalizeCustomFieldValueForStorage({
        type: "number",
        value: "   ",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe("")
  })

  test.each([
    ["1aaa1"],
    ["Infinity"],
    ["NaN"],
    ["abc"],
  ])("throws a typed ChatbotXException for %s instead of persisting garbage", async (raw) => {
    await expect(
      normalizeCustomFieldValueForStorage({
        type: "number",
        value: raw,
        resolveSourceTimezone: resolver,
      }),
    ).rejects.toMatchObject({ code: "invalidCustomFieldValue" })
  })

  test("never touches the source-timezone resolver", async () => {
    const spy = vi.fn(resolver)
    await normalizeCustomFieldValueForStorage({
      type: "number",
      value: "42",
      resolveSourceTimezone: spy,
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("runtime coercion — text types stay byte-identical", () => {
  test.each([
    "shortText",
    "longText",
    "email",
    "phoneNumber",
  ] as const)("%s passes through raw, untrimmed and unchanged", async (type) => {
    await expect(
      normalizeCustomFieldValueForStorage({
        type,
        value: "  Not-Trimmed@EXAMPLE.com  ",
        resolveSourceTimezone: resolver,
      }),
    ).resolves.toBe("  Not-Trimmed@EXAMPLE.com  ")
  })
})

describe("temporal stays on its own (unchanged) branch", () => {
  test("date normalization is unaffected by the new non-temporal registry", async () => {
    await expect(
      normalizeCustomFieldValueForStorage({
        type: "date",
        value: "2026-07-22",
        resolveSourceTimezone: () => Promise.resolve("Asia/Ho_Chi_Minh"),
      }),
    ).resolves.toBe("2026-07-22T00:00:00+07:00")
  })
})
