// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  rewriteCouponTokens,
  rewriteCouponTokensDeep,
} from "../src/template/field-token-binder"

const topics = new Map([["100", "900"]])

describe("coupon token rewrite", () => {
  test("follows the installed topic id and leaves other tokens alone", () => {
    expect(
      rewriteCouponTokens(
        "Code: {{coupon:100}} {{ coupon: 100 }} {{name}}",
        topics,
      ),
    ).toBe("Code: {{coupon:900}} {{coupon:900}} {{name}}")
  })

  test("leaves a topic that was not installed as written", () => {
    expect(rewriteCouponTokens("{{coupon:555}}", topics)).toBe("{{coupon:555}}")
  })

  test("rewrites nested string leaves without mutating the input", () => {
    const input = { nodes: [{ text: "{{coupon:100}}" }], keep: 1 }
    const output = rewriteCouponTokensDeep(input, topics)
    expect(output).toEqual({ nodes: [{ text: "{{coupon:900}}" }], keep: 1 })
    expect(input.nodes[0].text).toBe("{{coupon:100}}")
  })

  test("is a no-op without installed topics", () => {
    const input = { text: "{{coupon:100}}" }
    expect(rewriteCouponTokensDeep(input, undefined)).toBe(input)
  })
})

describe("collectResourceDependencies", () => {
  test("reports the sequences, questionnaires and coupon topics a graph names", async () => {
    const { collectResourceDependencies } = await import(
      "../src/template/manifest-references"
    )
    const found = collectResourceDependencies({
      nodes: [
        { data: { questionnaireId: "11" } },
        { data: { topicId: "22" } },
        { data: { sequenceId: "33" } },
      ],
    })
    expect(found).toEqual(
      expect.arrayContaining([
        { category: "questionnaires", sourceId: "11" },
        { category: "couponTopics", sourceId: "22" },
        { category: "sequences", sourceId: "33" },
      ]),
    )
  })
})
