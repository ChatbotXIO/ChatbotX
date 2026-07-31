import type { MentionNodeAttrs } from "@tiptap/extension-mention"
import { describe, expect, it } from "vitest"
import {
  plainTextToParagraphHtmlWithVariableMentions,
  renderVariableMentionHTML,
  renderVariableMentionText,
  replaceCouponVariableTokensWithLabels,
  toVariableMentionAttrs,
} from "@/components/tiptap/extensions/variable-injection/mention"

const COUPON_OPTION = {
  group: "Coupons",
  label: "Coupon 1",
  value: "coupon:116190115440721922",
}

const RAW_CUSTOM_FIELD_OPTION = {
  group: "Raw custom fields",
  label: "Full Name",
  value: "raw:Full Name",
}

const nodeWithAttrs = (attrs: MentionNodeAttrs) =>
  ({ attrs }) as unknown as Parameters<
    typeof renderVariableMentionText
  >[0]["node"]

describe("variable injection mention", () => {
  it("stores coupon variables by raw value and label separately", () => {
    expect(toVariableMentionAttrs(COUPON_OPTION)).toEqual({
      id: "coupon:116190115440721922",
      label: "Coupon 1",
      mentionSuggestionChar: "{{",
    })
  })

  it("serializes mention text with the raw coupon variable", () => {
    const text = renderVariableMentionText({
      node: nodeWithAttrs(toVariableMentionAttrs(COUPON_OPTION)),
    } as Parameters<typeof renderVariableMentionText>[0])

    expect(text).toBe("{{coupon:116190115440721922}}")
  })

  it("renders mention html with the coupon label", () => {
    const html = renderVariableMentionHTML({
      options: { HTMLAttributes: { "data-type": "mention" } },
      node: nodeWithAttrs(toVariableMentionAttrs(COUPON_OPTION)),
      suggestion: null,
    } as unknown as Parameters<typeof renderVariableMentionHTML>[0])

    expect(html).toEqual(["span", { "data-type": "mention" }, "{{Coupon 1}}"])
  })

  it("hydrates saved coupon variable text into a labeled mention node", () => {
    expect(
      plainTextToParagraphHtmlWithVariableMentions(
        "Code: {{coupon:116190115440721922}}",
        [COUPON_OPTION],
      ),
    ).toContain('data-label="Coupon 1"')
  })

  it("hydrates saved raw custom-field variable text into a labeled mention node", () => {
    expect(
      plainTextToParagraphHtmlWithVariableMentions("Name: {{raw:Full Name}}", [
        RAW_CUSTOM_FIELD_OPTION,
      ]),
    ).toContain('data-id="raw:Full Name"')
  })

  it("renders coupon tokens in step preview using the topic label", () => {
    expect(
      replaceCouponVariableTokensWithLabels(
        "Code: {{coupon:116190115440721922}}",
        new Map([
          [COUPON_OPTION.value.replace("coupon:", ""), COUPON_OPTION.label],
        ]),
      ),
    ).toBe("Code: {{Coupon 1}}")
  })
})
