// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  rewriteFieldTokens,
  rewriteFieldTokensDeep,
} from "../src/template/field-token-binder"

describe("rewriteFieldTokens", () => {
  test("rewrites {{name}} to the target's exact stored name", () => {
    const bindings = new Map([["Foo", "foo"]])

    expect(rewriteFieldTokens("Hi {{Foo}}!", bindings)).toBe("Hi {{foo}}!")
  })

  test("keeps the raw: prefix", () => {
    const bindings = new Map([["Notes", "Notes_1"]])

    expect(rewriteFieldTokens("{{raw:Notes}}", bindings)).toBe(
      "{{raw:Notes_1}}",
    )
  })

  test("applies every rewrite in one pass, never cascading", () => {
    const bindings = new Map([
      ["foo", "foo_1"],
      ["foo_1", "foo_2"],
    ])

    expect(rewriteFieldTokens("{{foo}} {{foo_1}}", bindings)).toBe(
      "{{foo_1}} {{foo_2}}",
    )
  })

  test("never rewrites a system field, a bot field, a coupon or a pipeline token", () => {
    const bindings = new Map([
      ["first_name", "x"],
      ["bot_field:12", "x"],
      ["coupon:SUMMER", "x"],
      ["pipelines.deals.name", "x"],
    ])
    const text =
      "{{first_name}} {{bot_field:12}} {{coupon:SUMMER}} {{pipelines.deals.name}}"

    expect(rewriteFieldTokens(text, bindings)).toBe(text)
  })

  test("leaves a token with no binding as written", () => {
    expect(rewriteFieldTokens("{{other}}", new Map([["Foo", "foo"]]))).toBe(
      "{{other}}",
    )
  })
})

describe("rewriteFieldTokensDeep", () => {
  test("rewrites string leaves anywhere in a nested structure without mutating it", () => {
    const original = {
      nodes: [{ data: { text: "Hi {{Foo}}", count: 3, flag: true } }],
    }
    const bindings = new Map([["Foo", "foo"]])

    const rewritten = rewriteFieldTokensDeep(original, bindings)

    expect(rewritten).toEqual({
      nodes: [{ data: { text: "Hi {{foo}}", count: 3, flag: true } }],
    })
    expect(original.nodes[0]?.data.text).toBe("Hi {{Foo}}")
  })

  test("returns the input untouched when there is nothing to bind", () => {
    const original = { text: "{{Foo}}" }

    expect(rewriteFieldTokensDeep(original, new Map())).toBe(original)
  })
})

describe("rewriteBotFieldTokens", () => {
  test("follows a bot field to its installed id and leaves unknown ids alone", async () => {
    const { rewriteBotFieldTokens } = await import(
      "../src/template/field-token-binder"
    )
    const ids = new Map([["7", "77"]])
    expect(
      rewriteBotFieldTokens(
        "Hi {{bot_field:7}} {{bot_field:8}} {{coupon:7}}",
        ids,
      ),
    ).toBe("Hi {{bot_field:77}} {{bot_field:8}} {{coupon:7}}")
  })
})
