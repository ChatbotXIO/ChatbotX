import type { MentionNodeAttrs } from "@tiptap/extension-mention"
import { describe, expect, it } from "vitest"
import {
  plainTextToParagraphHtmlWithVariableMentions,
  renderVariableMentionHTML,
  renderVariableMentionText,
  replaceBotFieldVariableTokensWithLabels,
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

const BOT_FIELD_OPTION = {
  group: "Bot Fields",
  label: "Support Hours",
  value: "bot_field:1",
}

const BOOKING_CALENDAR_OPTION = {
  label: "Booking Calendar",
  value: "booking_calendar",
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

  it("renders mention html with the raw id for non-coupon variables", () => {
    const html = renderVariableMentionHTML({
      options: { HTMLAttributes: { "data-type": "mention" } },
      node: nodeWithAttrs(toVariableMentionAttrs(BOOKING_CALENDAR_OPTION)),
      suggestion: null,
    } as unknown as Parameters<typeof renderVariableMentionHTML>[0])

    expect(html).toEqual([
      "span",
      { "data-type": "mention" },
      "{{booking_calendar}}",
    ])
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

  it("stores a bot field variable by its bot_field:<id> reference token and its name as the label", () => {
    expect(toVariableMentionAttrs(BOT_FIELD_OPTION)).toEqual({
      id: "bot_field:1",
      label: "Support Hours",
      mentionSuggestionChar: "{{",
    })
  })

  it("serializes a bot field mention as its bot_field:<id> reference token, not its label", () => {
    const text = renderVariableMentionText({
      node: nodeWithAttrs(toVariableMentionAttrs(BOT_FIELD_OPTION)),
    } as Parameters<typeof renderVariableMentionText>[0])

    expect(text).toBe("{{bot_field:1}}")
  })

  it("hydrates saved bot field variable text into a labeled mention node round-trip", () => {
    const html = plainTextToParagraphHtmlWithVariableMentions(
      "Hours: {{bot_field:1}}",
      [BOT_FIELD_OPTION],
    )

    expect(html).toContain('data-id="bot_field:1"')
    expect(html).toContain('data-label="Support Hours"')
  })

  it("renders mention html with the field NAME for a bot field variable (never the id token)", () => {
    const html = renderVariableMentionHTML({
      options: { HTMLAttributes: { "data-type": "mention" } },
      node: nodeWithAttrs(toVariableMentionAttrs(BOT_FIELD_OPTION)),
      suggestion: null,
    } as unknown as Parameters<typeof renderVariableMentionHTML>[0])

    expect(html).toEqual([
      "span",
      { "data-type": "mention" },
      "{{Support Hours}}",
    ])
  })

  it("renders bot field tokens in step preview using the field name; unknown ids keep the raw token", () => {
    const labelById = new Map([["1", "Support Hours"]])

    expect(
      replaceBotFieldVariableTokensWithLabels(
        "Hours: {{bot_field:1}} / {{bot_field:999}}",
        labelById,
      ),
    ).toBe("Hours: {{Support Hours}} / {{bot_field:999}}")
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

describe("replaceBotFieldVariableTokensWithLabels — malformed tokens", () => {
  const labels = new Map([["1", "Support Hours"]])

  it("leaves a token wrapped in extra braces verbatim", () => {
    expect(
      replaceBotFieldVariableTokensWithLabels("{{{{bot_field:1}}}}", labels),
    ).toBe("{{{{bot_field:1}}}}")
    expect(
      replaceBotFieldVariableTokensWithLabels("{{{bot_field:1}}}", labels),
    ).toBe("{{{bot_field:1}}}")
  })

  it("still relabels a well-formed token adjacent to other text", () => {
    expect(
      replaceBotFieldVariableTokensWithLabels("open: {{bot_field:1}}!", labels),
    ).toBe("open: {{Support Hours}}!")
  })

  it("leaves a non-numeric or unclosed token untouched", () => {
    expect(
      replaceBotFieldVariableTokensWithLabels("{{bot_field:abc}}", labels),
    ).toBe("{{bot_field:abc}}")
    expect(
      replaceBotFieldVariableTokensWithLabels("{{bot_field:1", labels),
    ).toBe("{{bot_field:1")
  })
})
