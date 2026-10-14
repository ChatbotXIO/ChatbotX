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
  sendMessageNodeDefaultFn,
  sendMessageNodeSchema,
} from "../src/nodes/send-message"
import { chooseChannelStepDefaultFn } from "../src/steps/choose-channel"
import {
  type SendProductsStepSchema,
  sendProductsContentSchema,
  sendProductsStepDefaultFn,
  sendProductsStepSchema,
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

describe("sendProducts content schema", () => {
  test("parses the message fields a sender outside a flow provides", () => {
    expect(
      sendProductsContentSchema.parse({
        display: "products",
        body: "Look",
        sections: [{ productIds: ["1"] }],
      }),
    ).toEqual({
      display: "products",
      body: "Look",
      sections: [{ productIds: ["1"] }],
    })
  })

  test("carries nothing that belongs to a flow step", () => {
    const parsed = sendProductsContentSchema.parse({
      id: "step-1",
      stepType: "sendProducts",
      display: "carousel",
      sections: [{ productIds: ["1", "2"] }],
    })

    expect(parsed).not.toHaveProperty("id")
    expect(parsed).not.toHaveProperty("stepType")
  })

  test("rejects a message without a display or sections", () => {
    expect(sendProductsContentSchema.safeParse({}).success).toBe(false)
  })

  test("the step schema accepts everything the content schema does", () => {
    const step = sendProductsStepDefaultFn({
      body: "Look",
      sections: [{ productIds: ["1"] }],
    })

    expect(sendProductsStepSchema.safeParse(step).success).toBe(true)
  })

  test("a sendProducts step still parses inside the send-message node", () => {
    const step = sendProductsStepDefaultFn({
      body: "Look",
      sections: [{ productIds: ["1"] }],
    })

    const defaults = sendMessageNodeDefaultFn({
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({ channel: "whatsapp" }),
      },
    })
    const node = sendMessageNodeSchema.safeParse({
      ...defaults,
      data: {
        ...defaults.data,
        details: { ...defaults.data.details, steps: [step] },
      },
    })

    expect(node.success).toBe(true)
  })
})

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

  test("rejects header, footer, titles and a second section", () => {
    expect(
      issueCodes(
        channelTypes.enum.whatsapp,
        buildStep({
          display: "carousel",
          header: "h",
          body: "Look",
          footer: "f",
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
    ])
  })
})

describe("evaluateProductMessage", () => {
  const shape = (props: Partial<ProductMessageShape>): ProductMessageShape => ({
    display: "products",
    sections: [{ productCount: 1 }],
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
