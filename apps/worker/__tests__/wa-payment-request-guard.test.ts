import type {
  SendWaTemplateMessageStepSchema,
  TemplateComponent,
} from "@chatbotx.io/flow-config"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { assertPaymentRequestsSendable } from "../src/integration/handlers/wa-payment-request-guard"

type Params = SendWaTemplateMessageStepSchema["template"]["params"]

const components: TemplateComponent[] = [
  {
    type: "BUTTONS",
    buttons: [
      { type: "QUICK_REPLY", text: "Later" },
      {
        type: "PAYMENT_REQUEST",
        text: "Copy Pix code",
        payment_setting: { type: "pix_dynamic_code" },
      },
    ],
  },
]

const pixParams = (code: string, amount?: string): Params => ({
  button: [
    {
      sub_type: "payment_request",
      index: 1,
      payment_request: { method: "pix", code, ...(amount && { amount }) },
    },
  ],
})

const failure = (params: Params, templateComponents = components) => {
  try {
    assertPaymentRequestsSendable({ params, components: templateComponents })
  } catch (error) {
    return error as ChannelError
  }
  return null
}

describe("assertPaymentRequestsSendable", () => {
  test("a filled request that matches the template passes", () => {
    expect(failure(pixParams("000201", "10.50"))).toBeNull()
  })

  test("templates and params without payment buttons pass untouched", () => {
    expect(
      failure({ body: [{ type: "text", text: "Hi" }] }, [
        { type: "BODY", text: "Hi {{1}}" },
      ]),
    ).toBeNull()
  })

  test.each([
    ["an unresolved variable", pixParams("{{pix_code}}")],
    ["a partly resolved value", pixParams("0002{{missing}}")],
    ["an empty value after substitution", pixParams("  ")],
    ["a malformed amount", pixParams("000201", "1.234")],
  ])("%s is a permanent payload error", (_name, params) => {
    const error = failure(params)
    expect(error).toBeInstanceOf(ChannelError)
    expect(error?.category).toBe(ChannelErrorCategory.PAYLOAD_INVALID)
    expect(error?.isRetryable).toBe(false)
  })

  test("the error text never contains the payment data", () => {
    const error = failure(pixParams("SECRET-{{unresolved}}"))
    expect(error?.message).not.toContain("SECRET")
  })

  test.each([
    [
      "the wrong method for the template button",
      {
        button: [
          {
            sub_type: "payment_request" as const,
            index: 1,
            payment_request: { method: "boleto" as const, digitableLine: "1" },
          },
        ],
      },
    ],
    ["a missing payment request", { button: [] }],
    [
      "a payment request for a button the template does not have",
      {
        button: [
          ...(pixParams("x").button ?? []),
          {
            sub_type: "payment_request" as const,
            index: 0,
            payment_request: { method: "pix" as const, code: "x" },
          },
        ],
      },
    ],
    [
      "two requests for one button",
      {
        button: [
          ...(pixParams("x").button ?? []),
          ...(pixParams("y").button ?? []),
        ],
      },
    ],
  ])("rejects %s", (_name, params) => {
    const error = failure(params)
    expect(error).toBeInstanceOf(ChannelError)
    expect(error?.category).toBe(ChannelErrorCategory.PAYLOAD_INVALID)
  })

  test("a template payment button of unknown method can never be sent", () => {
    const error = failure({ button: [] }, [
      {
        type: "BUTTONS",
        buttons: [{ type: "PAYMENT_REQUEST", text: "Pay now" }],
      },
    ])
    expect(error?.category).toBe(ChannelErrorCategory.PAYLOAD_INVALID)
  })

  test("stray payment data on a template without payment buttons is rejected", () => {
    const error = failure(pixParams("x"), [{ type: "BODY", text: "Hi" }])
    expect(error?.category).toBe(ChannelErrorCategory.PAYLOAD_INVALID)
  })
})
