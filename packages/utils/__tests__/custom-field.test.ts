import { describe, expect, test } from "vitest"
import {
  canonicalNumberLiteral,
  coerceBooleanLiteral,
} from "../src/custom-field"

// `coerceBooleanLiteral` itself still treats blank as falsy ("" -> "false") —
// it has no opinion on "unset" vs "false". Every real write path pre-checks
// blank before calling it (see `packages/business/src/contact-custom-field/
// normalize.ts`'s `RUNTIME_COERCE_HANDLERS.boolean`, which short-circuits a
// blank/whitespace-only value to "" — unset — before ever reaching this
// function), so this pins the raw function's actual defensive behavior, not
// the product policy for blank input.
describe("coerceBooleanLiteral", () => {
  test.each([
    ["true", "true"],
    ["TRUE", "true"],
    ["1", "true"],
    ["yes", "true"],
    ["false", "false"],
    ["0", "false"],
    ["no", "false"],
    // Generous: any unrecognized non-blank text coerces to "true".
    ["maybe", "true"],
    ["12313", "true"],
  ])("coerces %s -> %s", (raw, expected) => {
    expect(coerceBooleanLiteral(raw)).toBe(expected)
  })

  test.each([
    "",
    "   ",
  ])("returns 'false' for blank input %j (defensive default — real callers guard blanks first)", (raw) => {
    expect(coerceBooleanLiteral(raw)).toBe("false")
  })
})

// `canonicalNumberLiteral` is the single-source `number` canonicalizer for
// custom/bot field values (mirrors `canonicalBooleanLiteral` in the same
// module). It is deliberately WIDER than the old hand-rolled `NUMERIC_RE`
// regex in `packages/business/src/javascript-execution/custom-field-value.ts`
// — it accepts everything JS `Number()` accepts.
describe("canonicalNumberLiteral", () => {
  test.each([
    ["7", "7"],
    ["007", "7"],
    ["-2.5", "-2.5"],
    ["0", "0"],
    // Widened vocabulary vs. the old `NUMERIC_RE` regex — deliberate.
    ["+1", "1"],
    ["1.", "1"],
    [" 1.5 ", "1.5"],
    ["1e3", "1000"],
    ["0x10", "16"],
  ])("normalizes %s -> %s", (raw, expected) => {
    expect(canonicalNumberLiteral(raw)).toBe(expected)
  })

  test.each(["", "   "])("returns null for blank input %j", (raw) => {
    expect(canonicalNumberLiteral(raw)).toBeNull()
  })

  test.each([
    "1aaa1",
    "abc",
    "Infinity",
    "-Infinity",
    "NaN",
  ])("returns null for unparseable/non-finite input %s", (raw) => {
    expect(canonicalNumberLiteral(raw)).toBeNull()
  })
})
