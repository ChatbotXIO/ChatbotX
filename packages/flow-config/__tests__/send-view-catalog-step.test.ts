import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import {
  CHANNEL_FLOW_POLICIES,
  CHANNEL_POLICY_VERSION,
  stepSupport,
} from "../src/channel-rules/policies"
import {
  resolveSendViewCatalogLengthLimits,
  SEND_VIEW_CATALOG_FOOTER_MAX,
  SEND_VIEW_CATALOG_TEXT_MAX,
} from "../src/channel-rules/send-view-catalog-length-rules"
import { sendMessageNodeSchema } from "../src/nodes/send-message"
import {
  sendViewCatalogDetailsFormSchema,
  sendViewCatalogStepDefaultFn,
  sendViewCatalogStepSchema,
} from "../src/steps/send-view-catalog"
import { stepTypes } from "../src/steps/step-action"
import { flowValidationCodes } from "../src/validation-codes"

const step = (overrides: Record<string, unknown> = {}) => ({
  id: "1",
  stepType: stepTypes.enum.sendViewCatalog,
  text: "Browse our catalog",
  ...overrides,
})

const issueCodes = (result: {
  success: boolean
  error?: { issues: { message: string }[] }
}) => result.error?.issues.map((issue) => issue.message) ?? []

describe("sendViewCatalogStepDefaultFn", () => {
  test("builds an empty draft with a fresh id", () => {
    const first = sendViewCatalogStepDefaultFn()
    const second = sendViewCatalogStepDefaultFn()

    expect(first).toMatchObject({
      stepType: stepTypes.enum.sendViewCatalog,
      text: "",
      footer: "",
      thumbnailProductId: "",
    })
    expect(first.id).not.toBe(second.id)
  })

  test("lets callers override fields but never the identity", () => {
    const built = sendViewCatalogStepDefaultFn({ text: "Hi", footer: "Bye" })

    expect(built).toMatchObject({ text: "Hi", footer: "Bye" })
    expect(built.stepType).toBe(stepTypes.enum.sendViewCatalog)
  })
})

describe("sendViewCatalogStepSchema", () => {
  test("accepts a body alone: footer and thumbnail are optional", () => {
    const result = sendViewCatalogStepSchema.safeParse(step())

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ footer: "", thumbnailProductId: "" })
  })

  test("trims body, footer and thumbnail id", () => {
    const result = sendViewCatalogStepSchema.safeParse(
      step({
        text: "  Hello  ",
        footer: "  Bye  ",
        thumbnailProductId: "  sku-1  ",
      }),
    )

    expect(result.data).toMatchObject({
      text: "Hello",
      footer: "Bye",
      thumbnailProductId: "sku-1",
    })
  })

  test.each(["", "   ", "\n"])("rejects a blank body %j", (text) => {
    expect(sendViewCatalogStepSchema.safeParse(step({ text })).success).toBe(
      false,
    )
  })

  test("keeps newlines inside the footer", () => {
    const result = sendViewCatalogStepSchema.safeParse(
      step({ footer: "line one\nline two" }),
    )

    expect(result.data?.footer).toBe("line one\nline two")
  })

  test("caps body and footer at the widest supported limit", () => {
    const body = sendViewCatalogStepSchema.safeParse(
      step({ text: "a".repeat(SEND_VIEW_CATALOG_TEXT_MAX + 1) }),
    )
    const footer = sendViewCatalogStepSchema.safeParse(
      step({ footer: "a".repeat(SEND_VIEW_CATALOG_FOOTER_MAX + 1) }),
    )

    expect(issueCodes(body)).toEqual([
      flowValidationCodes.sendViewCatalogBodyTooLong,
    ])
    expect(issueCodes(footer)).toEqual([
      flowValidationCodes.sendViewCatalogFooterTooLong,
    ])
  })

  test("accepts exactly the limit", () => {
    expect(
      sendViewCatalogStepSchema.safeParse(
        step({
          text: "a".repeat(SEND_VIEW_CATALOG_TEXT_MAX),
          footer: "a".repeat(SEND_VIEW_CATALOG_FOOTER_MAX),
        }),
      ).success,
    ).toBe(true)
  })

  test("counts UTF-16 units, the unit WhatsApp's constructors enforce", () => {
    // An astral emoji is one code point but two UTF-16 units, so 513 of them
    // is 513 code points yet 1026 units: it must not slip past the cap and be
    // silently cut mid-emoji by the sender.
    const emoji = "😀"
    const atLimit = emoji.repeat(SEND_VIEW_CATALOG_TEXT_MAX / 2)
    const overLimit = emoji.repeat(SEND_VIEW_CATALOG_TEXT_MAX / 2 + 1)

    expect(
      sendViewCatalogStepSchema.safeParse(step({ text: atLimit })).success,
    ).toBe(true)
    expect(
      issueCodes(
        sendViewCatalogStepSchema.safeParse(step({ text: overLimit })),
      ),
    ).toEqual([flowValidationCodes.sendViewCatalogBodyTooLong])
  })
})

describe("sendViewCatalogDetailsFormSchema", () => {
  test("validates just the dialog's fields, with the step's own limits", () => {
    expect(
      sendViewCatalogDetailsFormSchema.safeParse({
        footer: "Free shipping",
        thumbnailProductId: "sku-1",
      }).success,
    ).toBe(true)
    expect(
      issueCodes(
        sendViewCatalogDetailsFormSchema.safeParse({
          footer: "a".repeat(SEND_VIEW_CATALOG_FOOTER_MAX + 1),
          thumbnailProductId: "",
        }),
      ),
    ).toEqual([flowValidationCodes.sendViewCatalogFooterTooLong])
  })

  test("does not require the body, which lives outside the dialog", () => {
    expect(sendViewCatalogDetailsFormSchema.safeParse({}).success).toBe(true)
  })
})

describe("resolveSendViewCatalogLengthLimits", () => {
  test("WhatsApp declares 1024 body / 60 footer", () => {
    expect(resolveSendViewCatalogLengthLimits("whatsapp")).toEqual({
      text: 1024,
      footer: 60,
    })
  })

  test.each([
    channelTypes.enum.omnichannel,
    "unknown",
    null,
    undefined,
  ])("falls back to the widest supported limits for %s", (channel) => {
    expect(resolveSendViewCatalogLengthLimits(channel)).toEqual({
      text: SEND_VIEW_CATALOG_TEXT_MAX,
      footer: SEND_VIEW_CATALOG_FOOTER_MAX,
    })
  })
})

describe("sendMessage node", () => {
  const nodeStep = (overrides: Record<string, unknown> = {}) =>
    sendMessageNodeSchema.shape.data.shape.details.shape.steps.element.safeParse(
      step(overrides),
    )

  test("accepts a node carrying the step", () => {
    expect(nodeStep().success).toBe(true)
  })

  test("rejects an over-limit body on a raw graph, so nothing is clamped silently at send time", () => {
    expect(
      issueCodes(
        nodeStep({ text: "a".repeat(SEND_VIEW_CATALOG_TEXT_MAX + 1) }),
      ),
    ).toEqual([flowValidationCodes.sendViewCatalogBodyTooLong])
  })
})

describe("channel policy", () => {
  test("only WhatsApp and omnichannel deliver the step today", () => {
    const supportByChannel = Object.fromEntries(
      Object.entries(CHANNEL_FLOW_POLICIES).map(([channel, policy]) => [
        channel,
        policy.steps[stepTypes.enum.sendViewCatalog],
      ]),
    )

    expect(supportByChannel).toEqual({
      api: stepSupport.unsupported,
      instagram: stepSupport.unsupported,
      messenger: stepSupport.unsupported,
      omnichannel: stepSupport.full,
      smtp: stepSupport.unsupported,
      telegram: stepSupport.unsupported,
      threads: stepSupport.unsupported,
      tiktok: stepSupport.unsupported,
      webchat: stepSupport.unsupported,
      whatsapp: stepSupport.full,
      zalo: stepSupport.unsupported,
    })
  })

  test("the externally reported policy version was bumped for the new support", () => {
    expect(CHANNEL_POLICY_VERSION).toBe(3)
  })
})
