import { describe, expect, test } from "vitest"
import {
  applySpintax,
  containsSpintax,
  SPINTAX_MAX_BLOCK_LENGTH,
  SPINTAX_MAX_BRANCHES,
} from "../src/spintax"

const first = { pick: () => 0 }
const second = { pick: () => 1 }

describe("containsSpintax", () => {
  test.each([
    "{Hi|Hello}",
    "{Hi|Hello|Hey} {{first_name}}",
    "trailing {a|b} text",
    "{Hi|}",
  ])("detects a block in %j", (value) => {
    expect(containsSpintax(value)).toBe(true)
  })

  // A block needs a `|`, and its content may not cross a brace or a newline —
  // which is exactly what keeps the variable grammar out of reach.
  test.each([
    "{{first_name}}",
    "{{coupon:SUMMER}}",
    "{{bot_field:12}}",
    "{{raw:field}}",
    "plain text | with a pipe",
    "{no pipe here}",
    "{a\nb|c}",
    "",
  ])("finds no block in %j", (value) => {
    expect(containsSpintax(value)).toBe(false)
  })
})

describe("applySpintax", () => {
  test("picks a branch", () => {
    expect(applySpintax("{Hi|Hello|Hey} bạn", first)).toBe("Hi bạn")
    expect(applySpintax("{Hi|Hello|Hey} bạn", second)).toBe("Hello bạn")
  })

  test("trims each branch", () => {
    expect(applySpintax("{ Chào | Hi } bạn", first)).toBe("Chào bạn")
    expect(applySpintax("{ Chào | Hi } bạn", second)).toBe("Hi bạn")
  })

  test("an empty branch renders as nothing", () => {
    expect(applySpintax("Chào{ bạn|}", second)).toBe("Chào")
  })

  // Each occurrence is drawn on its own — that is the whole point of spintax,
  // so two identical blocks must be able to disagree.
  test("draws each occurrence independently", () => {
    const picks = [0, 1]
    let call = 0
    const result = applySpintax("{Hi|Hello} … {Hi|Hello}", {
      pick: () => picks[call++] ?? 0,
    })

    expect(result).toBe("Hi … Hello")
    expect(call).toBe(2)
  })

  test("leaves text without a block untouched", () => {
    expect(applySpintax("Chào bạn", first)).toBe("Chào bạn")
  })

  // The guarantee the whole two-pass design rests on: the variable pass runs
  // after this one and must still see every placeholder intact.
  test.each([
    "{{first_name}}",
    "Chào {{first_name}}, mã {{coupon:SUMMER}}",
    "{{raw:note}} {{bot_field:12}}",
    "{{ full_name }}",
  ])("never touches the variable placeholder in %j", (value) => {
    expect(applySpintax(value, first)).toBe(value)
  })

  test("mixes with variables in one string", () => {
    expect(applySpintax("{Chào|Hi} {{first_name}}!", first)).toBe(
      "Chào {{first_name}}!",
    )
  })

  test("does not span a newline", () => {
    expect(applySpintax("{Hi\n|Hello}", first)).toBe("{Hi\n|Hello}")
  })

  // Documents why callers must opt in rather than getting spintax globally: a
  // JSON fragment or a TypeScript-style union in an AI prompt is a valid block
  // by grammar, and would be mangled if this ran everywhere.
  test("a JSON-like fragment does match — hence opt-in", () => {
    expect(applySpintax('{"a": "x|y"}', first)).toBe('"a": "x')
  })

  test("leaves an oversized block verbatim", () => {
    const content = `${"a".repeat(SPINTAX_MAX_BLOCK_LENGTH)}|b`
    const value = `{${content}}`

    expect(applySpintax(value, first)).toBe(value)
  })

  test("leaves a block with too many branches verbatim", () => {
    const value = `{${Array.from({ length: SPINTAX_MAX_BRANCHES + 1 }, (_, i) => i).join("|")}}`

    expect(applySpintax(value, first)).toBe(value)
  })

  test("an out-of-range pick leaves the block verbatim", () => {
    expect(applySpintax("{Hi|Hello}", { pick: () => 9 })).toBe("{Hi|Hello}")
  })
})
