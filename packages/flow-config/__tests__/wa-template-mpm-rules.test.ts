import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import {
  countMpmProducts,
  flowValidationCodes,
  sendWaTemplateMessageValidator,
  stepTypes,
  waTemplateMpmLimits,
} from "../src"

const refinedStepSchema =
  sendWaTemplateMessageValidator[channelTypes.enum.omnichannel]

const baseStep = {
  id: "1",
  nodeId: "node-1",
  stepType: stepTypes.enum.sendWaTemplateMessage,
  template: {
    id: "tmpl-1",
    name: "tpl",
    language: "en",
    inboxId: null,
    params: {},
  },
  buttons: [],
}

const issuesFor = (params: Record<string, unknown>) => {
  const result = refinedStepSchema.safeParse({
    ...baseStep,
    template: { ...baseStep.template, params },
  })
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe("countMpmProducts", () => {
  test("sums product_items across every section", () => {
    expect(
      countMpmProducts([
        { title: "A", product_items: [{ product_retailer_id: "1" }] },
        {
          title: "B",
          product_items: [
            { product_retailer_id: "2" },
            { product_retailer_id: "3" },
          ],
        },
      ]),
    ).toBe(3)
  })

  test("treats missing sections/product_items as zero", () => {
    expect(countMpmProducts(undefined)).toBe(0)
    expect(countMpmProducts([{ title: "Empty" }])).toBe(0)
  })
})

describe("MPM publish validation — top-level button", () => {
  test("an MPM button with zero configured products is invalid", () => {
    expect(
      issuesFor({ button: [{ sub_type: "mpm", index: 0, sections: [] }] }),
    ).toContain(flowValidationCodes.waTemplateMpmNoProducts)
  })

  test("an MPM button with no sections at all is invalid", () => {
    expect(issuesFor({ button: [{ sub_type: "mpm", index: 0 }] })).toContain(
      flowValidationCodes.waTemplateMpmNoProducts,
    )
  })

  test("an MPM button with at least one product is valid", () => {
    expect(
      issuesFor({
        button: [
          {
            sub_type: "mpm",
            index: 0,
            sections: [
              {
                title: "Best sellers",
                product_items: [{ product_retailer_id: "sku-1" }],
              },
            ],
          },
        ],
      }),
    ).toEqual([])
  })

  test("non-MPM buttons are left alone", () => {
    expect(
      issuesFor({ button: [{ sub_type: "url", index: 0, text: "" }] }),
    ).toEqual([])
  })

  test("unfilled placeholder rows (blank retailer id) never count as products", () => {
    expect(
      issuesFor({
        button: [
          {
            sub_type: "mpm",
            index: 0,
            sections: [
              {
                title: "Best sellers",
                product_items: [
                  { product_retailer_id: "" },
                  { product_retailer_id: "   " },
                ],
              },
            ],
          },
        ],
      }),
    ).toContain(flowValidationCodes.waTemplateMpmNoProducts)
  })

  test("a blank row next to a real product is invalid (would send an empty id to Meta)", () => {
    expect(
      issuesFor({
        button: [
          {
            sub_type: "mpm",
            index: 0,
            sections: [
              {
                title: "Best sellers",
                product_items: [
                  { product_retailer_id: "sku-1" },
                  { product_retailer_id: "" },
                ],
              },
            ],
          },
        ],
      }),
    ).toContain(flowValidationCodes.waTemplateMpmIncompleteProducts)
  })

  test("an extra section with no products is invalid even when another section is complete", () => {
    expect(
      issuesFor({
        button: [
          {
            sub_type: "mpm",
            index: 0,
            sections: [
              {
                title: "Best sellers",
                product_items: [{ product_retailer_id: "sku-1" }],
              },
              { title: "Empty", product_items: [] },
            ],
          },
        ],
      }),
    ).toContain(flowValidationCodes.waTemplateMpmIncompleteProducts)
  })

  test("exceeding the section limit is invalid", () => {
    const sections = Array.from(
      { length: waTemplateMpmLimits.maxSections + 1 },
      (_, i) => ({
        title: `Section ${i}`,
        product_items: [{ product_retailer_id: `sku-${i}` }],
      }),
    )

    expect(
      issuesFor({ button: [{ sub_type: "mpm", index: 0, sections }] }),
    ).toContain(flowValidationCodes.waTemplateMpmTooManySections)
  })

  test("exceeding the total product limit is invalid", () => {
    const productItems = Array.from(
      { length: waTemplateMpmLimits.maxProductsTotal + 1 },
      (_, i) => ({ product_retailer_id: `sku-${i}` }),
    )

    expect(
      issuesFor({
        button: [
          {
            sub_type: "mpm",
            index: 0,
            sections: [{ title: "Everything", product_items: productItems }],
          },
        ],
      }),
    ).toContain(flowValidationCodes.waTemplateMpmTooManyProducts)
  })
})

describe("MPM publish validation — carousel card button", () => {
  test("an MPM button inside a carousel card with zero products is invalid", () => {
    expect(
      issuesFor({
        carousel: [
          {
            card_index: 0,
            button: [{ sub_type: "mpm", index: 0, sections: [] }],
          },
        ],
      }),
    ).toContain(flowValidationCodes.waTemplateMpmNoProducts)
  })

  test("an MPM button inside a carousel card with a product is valid", () => {
    expect(
      issuesFor({
        carousel: [
          {
            card_index: 0,
            button: [
              {
                sub_type: "mpm",
                index: 0,
                sections: [
                  {
                    title: "Card picks",
                    product_items: [{ product_retailer_id: "sku-1" }],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([])
  })
})
