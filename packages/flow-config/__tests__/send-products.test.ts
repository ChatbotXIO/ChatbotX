import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import { resolveStepValidator } from "../src/channel-rules/channel-validator"
import {
  CHANNEL_FLOW_POLICIES,
  stepSupport,
} from "../src/channel-rules/policies"
import {
  evaluateProductMessage,
  type ProductMessageShape,
} from "../src/channel-rules/product-message-rules"
import { channelAwareStepValidators } from "../src/channel-rules/validators"
import {
  type SendProductsStepSchema,
  sendProductsStepDefaultFn,
} from "../src/steps/send-products"
import { stepTypes } from "../src/steps/step-action"
import { flowValidationCodes } from "../src/validation-codes"

const whatsappCapability =
  CHANNEL_FLOW_POLICIES[channelTypes.enum.whatsapp].productMessages

const productIds = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => String(from + index))

const buildStep = (
  props: Partial<SendProductsStepSchema>,
): SendProductsStepSchema => sendProductsStepDefaultFn(props)

const issueCodes = (
  channel: string,
  step: SendProductsStepSchema,
): string[] => {
  const validator = channelAwareStepValidators[stepTypes.enum.sendProducts]
  if (!validator) {
    throw new Error("sendProducts validator is not registered")
  }
  const result = resolveStepValidator(validator, channel).safeParse(step)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

const validOnWhatsapp = (step: SendProductsStepSchema) =>
  expect(issueCodes(channelTypes.enum.whatsapp, step)).toEqual([])

describe("sendProducts channel support", () => {
  test("only whatsapp declares the capability", () => {
    const channelsWithCapability = Object.entries(CHANNEL_FLOW_POLICIES)
      .filter(([, policy]) => policy.productMessages)
      .map(([channel]) => channel)

    expect(channelsWithCapability).toEqual([channelTypes.enum.whatsapp])
  })

  test("is supported on whatsapp and unsupported everywhere else, omnichannel included", () => {
    for (const [channel, policy] of Object.entries(CHANNEL_FLOW_POLICIES)) {
      expect(policy.steps.sendProducts, channel).toBe(
        channel === channelTypes.enum.whatsapp
          ? stepSupport.full
          : stepSupport.unsupported,
      )
    }
  })
})

describe("sendProducts on whatsapp", () => {
  test("accepts one product with no text", () => {
    validOnWhatsapp(buildStep({ sections: [{ productIds: ["1"] }] }))
  })

  test("accepts a multi-product message with header, body and titled sections", () => {
    validOnWhatsapp(
      buildStep({
        header: "Our picks",
        body: "Have a look",
        footer: "Free delivery",
        sections: [
          { title: "Shoes", productIds: ["1", "2"] },
          { title: "Bags", productIds: ["3"] },
        ],
      }),
    )
  })

  test("accepts exactly 30 products across 10 sections", () => {
    validOnWhatsapp(
      buildStep({
        header: "h",
        body: "b",
        sections: Array.from({ length: 10 }, (_, index) => ({
          title: `s${index}`,
          productIds: productIds(3, index * 3 + 1),
        })),
      }),
    )
  })

  test("rejects a header on a single product", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({ header: "h", sections: [{ productIds: ["1"] }] }),
      ),
    ).toEqual([flowValidationCodes.sendProductsFieldNotAllowed])
  })

  test("requires header and body once there are 2+ products", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({ sections: [{ productIds: ["1", "2"] }] }),
      ),
    ).toEqual([
      flowValidationCodes.sendProductsFieldRequired,
      flowValidationCodes.sendProductsFieldRequired,
    ])
  })

  test("requires a title on every section once there are 2+ sections", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          header: "h",
          body: "b",
          sections: [
            { title: "Shoes", productIds: ["1"] },
            { productIds: ["2"] },
          ],
        }),
      ),
    ).toEqual([flowValidationCodes.sendProductsFieldRequired])
  })

  test("rejects text over the channel limits", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          header: "h".repeat(61),
          body: "b".repeat(1025),
          footer: "f".repeat(61),
          sections: [
            { title: "t".repeat(25), productIds: ["1"] },
            { title: "ok", productIds: ["2"] },
          ],
        }),
      ),
    ).toEqual([
      flowValidationCodes.sendProductsFieldTooLong,
      flowValidationCodes.sendProductsFieldTooLong,
      flowValidationCodes.sendProductsFieldTooLong,
      flowValidationCodes.sendProductsFieldTooLong,
    ])
  })

  test("rejects 31 products and 11 sections", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          header: "h",
          body: "b",
          sections: [{ title: "t", productIds: productIds(31) }],
        }),
      ),
    ).toEqual([flowValidationCodes.sendProductsProductCountOutOfRange])

    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          header: "h",
          body: "b",
          sections: Array.from({ length: 11 }, (_, index) => ({
            title: `s${index}`,
            productIds: [String(index + 1)],
          })),
        }),
      ),
    ).toEqual([flowValidationCodes.sendProductsSectionCountOutOfRange])
  })

  test("rejects duplicate products and empty sections on every channel", () => {
    const duplicated = buildStep({
      header: "h",
      body: "b",
      sections: [
        { title: "a", productIds: ["1", "2"] },
        { title: "b", productIds: ["2"] },
      ],
    })
    expect(issueCodes(channelTypes.enum.whatsapp, duplicated)).toEqual([
      flowValidationCodes.sendProductsDuplicateProduct,
    ])
    expect(issueCodes(channelTypes.enum.omnichannel, duplicated)).toEqual([
      flowValidationCodes.sendProductsDuplicateProduct,
    ])

    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({ sections: [{ productIds: [] }] }),
      ),
    ).toContain(flowValidationCodes.sendProductsProductCountOutOfRange)
  })

  test("counts an emoji once, like the editor does", () => {
    const sixtyEmoji = "😀".repeat(60)
    validOnWhatsapp(
      buildStep({
        header: sixtyEmoji,
        body: "b",
        sections: [{ productIds: ["1", "2"] }],
      }),
    )
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          header: "😀".repeat(61),
          body: "b",
          sections: [{ productIds: ["1", "2"] }],
        }),
      ),
    ).toEqual([flowValidationCodes.sendProductsFieldTooLong])
  })

  test("treats whitespace-only text as absent", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          display: "carousel",
          body: "   ",
          sections: [{ productIds: ["1", "2"] }],
        }),
      ),
    ).toEqual([flowValidationCodes.sendProductsFieldRequired])
  })
})

describe("sendProducts carousel on whatsapp", () => {
  test("accepts 2 to 10 products with a body only", () => {
    validOnWhatsapp(
      buildStep({
        display: "carousel",
        body: "Look",
        sections: [{ productIds: productIds(10) }],
      }),
    )
  })

  test("rejects 1 or 11 products", () => {
    for (const count of [1, 11]) {
      expect(
        issueCodes(
          channelTypes.enum.whatsapp,
          buildStep({
            display: "carousel",
            body: "Look",
            sections: [{ productIds: productIds(count) }],
          }),
        ),
      ).toEqual([flowValidationCodes.sendProductsProductCountOutOfRange])
    }
  })

  test("rejects header, footer, titles, a second section and a thumbnail", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          display: "carousel",
          header: "h",
          body: "Look",
          footer: "f",
          thumbnailProductId: "9",
          sections: [
            { title: "t", productIds: ["1", "2"] },
            { productIds: ["3"] },
          ],
        }),
      ),
    ).toEqual([
      flowValidationCodes.sendProductsSectionCountOutOfRange,
      flowValidationCodes.sendProductsFieldNotAllowed,
      flowValidationCodes.sendProductsFieldNotAllowed,
      flowValidationCodes.sendProductsFieldNotAllowed,
      flowValidationCodes.sendProductsThumbnailNotAllowed,
    ])
  })
})

describe("sendProducts catalog on whatsapp", () => {
  test("accepts a body with or without footer and thumbnail", () => {
    validOnWhatsapp(
      buildStep({ display: "catalog", body: "Browse", sections: [] }),
    )
    validOnWhatsapp(
      buildStep({
        display: "catalog",
        body: "Browse",
        footer: "f",
        thumbnailProductId: "1",
        sections: [],
      }),
    )
  })

  test("requires a body and rejects header and products", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          display: "catalog",
          header: "h",
          sections: [{ productIds: ["1"] }],
        }),
      ),
    ).toEqual([
      flowValidationCodes.sendProductsProductCountOutOfRange,
      flowValidationCodes.sendProductsSectionCountOutOfRange,
      flowValidationCodes.sendProductsFieldNotAllowed,
      flowValidationCodes.sendProductsFieldRequired,
    ])
  })

  test("rejects a thumbnail on the products display", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          thumbnailProductId: "1",
          sections: [{ productIds: ["2"] }],
        }),
      ),
    ).toEqual([flowValidationCodes.sendProductsThumbnailNotAllowed])
  })
})

describe("evaluateProductMessage", () => {
  const shape = (props: Partial<ProductMessageShape>): ProductMessageShape => ({
    display: "products",
    sections: [{ productCount: 1 }],
    hasThumbnail: false,
    ...props,
  })

  test("reports an unsupported display instead of throwing", () => {
    expect(
      evaluateProductMessage({ displays: {} }, shape({ display: "carousel" })),
    ).toEqual([
      {
        code: flowValidationCodes.sendProductsDisplayUnsupported,
        path: ["display"],
      },
    ])
  })

  test("points each issue at the offending field", () => {
    if (!whatsappCapability) {
      throw new Error("whatsapp capability missing")
    }

    expect(
      evaluateProductMessage(
        whatsappCapability,
        shape({
          header: "h",
          body: "b",
          sections: [{ title: "a", productCount: 1 }, { productCount: 1 }],
        }),
      ),
    ).toEqual([
      {
        code: flowValidationCodes.sendProductsFieldRequired,
        path: ["sections", 1, "title"],
      },
    ])
  })
})
