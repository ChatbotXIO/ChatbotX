import { describe, expect, test } from "vitest"
import {
  buildTemplateStructure,
  templateStructureKey,
} from "../src/template-structure"

const base = {
  name: "promo",
  language: "vi",
  category: "MARKETING",
  parameterFormat: "POSITIONAL",
}

const whatsappComponents = (headerHandle: string) => [
  {
    type: "HEADER",
    format: "IMAGE",
    example: { header_handle: [headerHandle] },
  },
  {
    type: "BODY",
    text: "Hi {{1}}, code {{2}}",
    example: { body_text: [["Ada", "X"]] },
  },
  {
    type: "BUTTONS",
    buttons: [
      {
        type: "URL",
        text: "Shop",
        url: "https://shop.test/{{1}}",
        example: ["a"],
      },
      {
        type: "FLOW",
        text: "Book",
        flow_id: 1_690_702_985_711_558,
        navigate_screen: "WELCOME",
      },
      { type: "COPY_CODE", text: "Copy", example: ["SALE"] },
    ],
  },
]

describe("templateStructureKey", () => {
  test("ignores page-specific example data such as uploaded header handles and samples", () => {
    const a = templateStructureKey({
      ...base,
      components: whatsappComponents("4:handle-page-a"),
    })
    const b = templateStructureKey({
      ...base,
      components: whatsappComponents("4:handle-page-b"),
    })
    expect(a).toBe(b)
  })

  test("is independent of object key order", () => {
    const ordered = templateStructureKey({
      ...base,
      components: [{ type: "BODY", text: "Hi {{1}}" }],
    })
    const reordered = templateStructureKey({
      components: [{ text: "Hi {{1}}", type: "BODY" }],
      parameterFormat: "POSITIONAL",
      category: "MARKETING",
      language: "vi",
      name: "promo",
    })
    expect(ordered).toBe(reordered)
  })

  test("differs when the body placeholders differ", () => {
    const one = templateStructureKey({
      ...base,
      components: [{ type: "BODY", text: "Hi {{1}}" }],
    })
    const two = templateStructureKey({
      ...base,
      components: [{ type: "BODY", text: "Hi {{1}} {{2}}" }],
    })
    expect(one).not.toBe(two)
  })

  test("differs between a static and a dynamic URL button", () => {
    const button = (url: string) => ({
      ...base,
      components: [
        { type: "BUTTONS", buttons: [{ type: "URL", text: "Go", url }] },
      ],
    })
    expect(templateStructureKey(button("https://a.test"))).not.toBe(
      templateStructureKey(button("https://a.test/{{1}}")),
    )
  })

  test("differs between a static and a dynamic Messenger postback payload", () => {
    const postback = (payload: string) => ({
      ...base,
      components: [
        {
          type: "BUTTONS",
          buttons: [{ type: "POSTBACK", text: "Go", payload }],
        },
      ],
    })
    expect(templateStructureKey(postback("FIXED"))).not.toBe(
      templateStructureKey(postback("{{flow}}")),
    )
  })

  test("differs when a WhatsApp FLOW button points at another flow or screen", () => {
    const flow = (flowId: number, screen: string) => ({
      ...base,
      components: [
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "FLOW",
              text: "Book",
              flow_id: flowId,
              navigate_screen: screen,
            },
          ],
        },
      ],
    })
    expect(templateStructureKey(flow(1, "A"))).not.toBe(
      templateStructureKey(flow(2, "A")),
    )
    expect(templateStructureKey(flow(1, "A"))).not.toBe(
      templateStructureKey(flow(1, "B")),
    )
  })

  test("differs across button kinds, order, header format, parameter format and LTO flag", () => {
    const withButtons = (buttons: unknown[]) => ({
      ...base,
      components: [{ type: "BUTTONS", buttons }],
    })
    expect(
      templateStructureKey(withButtons([{ type: "COPY_CODE", text: "Copy" }])),
    ).not.toBe(
      templateStructureKey(withButtons([{ type: "CATALOG", text: "Copy" }])),
    )
    expect(
      templateStructureKey(
        withButtons([
          { type: "QUICK_REPLY", text: "A" },
          { type: "QUICK_REPLY", text: "B" },
        ]),
      ),
    ).not.toBe(
      templateStructureKey(
        withButtons([
          { type: "QUICK_REPLY", text: "B" },
          { type: "QUICK_REPLY", text: "A" },
        ]),
      ),
    )
    expect(
      templateStructureKey({
        ...base,
        components: [{ type: "HEADER", format: "IMAGE" }],
      }),
    ).not.toBe(
      templateStructureKey({
        ...base,
        components: [{ type: "HEADER", format: "VIDEO" }],
      }),
    )
    expect(templateStructureKey({ ...base, components: [] })).not.toBe(
      templateStructureKey({
        ...base,
        parameterFormat: "NAMED",
        components: [],
      }),
    )
    expect(
      templateStructureKey({
        ...base,
        components: [
          {
            type: "LIMITED_TIME_OFFER",
            limited_time_offer: { has_expiration: true },
          },
        ],
      }),
    ).not.toBe(
      templateStructureKey({
        ...base,
        components: [
          {
            type: "LIMITED_TIME_OFFER",
            limited_time_offer: { has_expiration: false },
          },
        ],
      }),
    )
  })

  test("normalises carousel cards recursively and drops card examples", () => {
    const carousel = (handle: string) => ({
      ...base,
      components: [
        {
          type: "CAROUSEL",
          cards: [
            {
              card_index: 0,
              components: [
                {
                  type: "HEADER",
                  format: "IMAGE",
                  example: { header_handle: [handle] },
                },
                { type: "BODY", text: "Card {{1}}" },
              ],
            },
          ],
        },
      ],
    })
    expect(templateStructureKey(carousel("h1"))).toBe(
      templateStructureKey(carousel("h2")),
    )
    expect(
      buildTemplateStructure(carousel("h1")).components[0]?.cards?.[0],
    ).toMatchObject({
      cardIndex: 0,
      components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Card {{1}}" },
      ],
    })
  })

  test("tolerates malformed component payloads without throwing", () => {
    expect(() =>
      templateStructureKey({ ...base, components: "not-an-array" }),
    ).not.toThrow()
    expect(
      buildTemplateStructure({
        ...base,
        components: [null, 1, { type: "BODY" }],
      }).components,
    ).toEqual([{ type: "BODY" }])
  })
})
