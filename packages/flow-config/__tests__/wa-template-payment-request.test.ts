import { zodUrlWithVariables } from "@chatbotx.io/utils"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { describe, expect, test } from "vitest"
import {
  bindWaTemplateQuickReplyButtons,
  buttonStepDefaultFn,
  collectPaymentRequestIssues,
  extractTemplateParams,
  findPaymentRequestMismatches,
  flowValidationCodes,
  resolveWaPaymentRequestMethod,
  sendWaTemplateMessageValidator,
  stepTypes,
  type TemplateComponent,
  type WaTemplateParams,
  waTemplateParamsSchema,
} from "../src"
import { templateStructureKey } from "../src/template-structure"

const pixButton = {
  type: "PAYMENT_REQUEST",
  text: "Copy Pix code",
  payment_setting: { type: "pix_dynamic_code" },
}
const boletoButton = { type: "PAYMENT_REQUEST", text: "Copy Boleto code" }
const quickReply = { type: "QUICK_REPLY", text: "Later" }

describe("resolveWaPaymentRequestMethod", () => {
  test.each([
    [
      { text: "Copy Pix code", payment_setting: { type: "pix_dynamic_code" } },
      "pix",
    ],
    [
      { text: "Copy Boleto code", payment_setting: { type: "boleto" } },
      "boleto",
    ],
    [
      { text: "Open payment link", payment_setting: { type: "payment_link" } },
      "payment_link",
    ],
    [
      { text: "Review payment", payment_setting: { type: "offsite_card_pay" } },
      "card_on_file",
    ],
    // type absent → the fixed label decides
    [{ text: "Copy Pix code" }, "pix"],
    [{ text: "  copy boleto CODE " }, "boleto"],
    // Meta returns the type upper-case when a template is read
    [
      { text: "Copy Pix code", payment_setting: { type: "PIX_DYNAMIC_CODE" } },
      "pix",
    ],
    [
      { text: "Copy Boleto code", payment_setting: { type: "BOLETO" } },
      "boleto",
    ],
    [
      { text: "Open payment link", payment_setting: { type: "PAYMENT_LINK" } },
      "payment_link",
    ],
    [
      { text: "Review payment", payment_setting: { type: "OFFSITE_CARD_PAY" } },
      "card_on_file",
    ],
    // known type decides; a localized or missing label is not a contradiction
    [{ text: "", payment_setting: { type: "boleto" } }, "boleto"],
    [
      {
        text: "Copiar código Pix",
        payment_setting: { type: "pix_dynamic_code" },
      },
      "pix",
    ],
    [
      {
        text: "Abrir link de pagamento",
        payment_setting: { type: "payment_link" },
      },
      "payment_link",
    ],
  ])("%j → %s", (button, expected) => {
    expect(resolveWaPaymentRequestMethod(button)).toBe(expected)
  })

  test.each([
    // unknown type never falls back to the label
    [{ text: "Copy Pix code", payment_setting: { type: "future_method" } }],
    // known type conflicting with another method's label
    [
      {
        text: "Copy Boleto code",
        payment_setting: { type: "pix_dynamic_code" },
      },
    ],
    // known type conflicting with a different method's documented label
    [
      {
        text: "Open payment link",
        payment_setting: { type: "offsite_card_pay" },
      },
    ],
    // no type: only the fixed English labels are trusted
    [{ text: "Copiar código Pix" }],
    [{ text: "Pay now" }],
    [{ text: "" }],
  ])("%j → unsupported", (button) => {
    expect(resolveWaPaymentRequestMethod(button)).toBeNull()
  })
})

describe("extractTemplateParams — PAYMENT_REQUEST", () => {
  test("seeds a blank request of the resolved method, keeping the button index", () => {
    const components: TemplateComponent[] = [
      { type: "BODY", text: "Pay" },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Static", url: "https://a.test" },
          pixButton,
          quickReply,
        ],
      },
    ]
    expect(extractTemplateParams(components).button).toEqual([
      {
        sub_type: "payment_request",
        index: 1,
        payment_request: { method: "pix", code: "" },
      },
    ])
  })

  test("an unresolvable payment button is not seeded", () => {
    const components: TemplateComponent[] = [
      {
        type: "BUTTONS",
        buttons: [{ type: "PAYMENT_REQUEST", text: "Pay now" }],
      },
    ]
    expect(extractTemplateParams(components).button).toBeUndefined()
  })

  test("carousel card payment buttons are not supported", () => {
    const components: TemplateComponent[] = [
      {
        type: "CAROUSEL",
        cards: [
          {
            card_index: 0,
            components: [{ type: "BUTTONS", buttons: [pixButton] }],
          },
        ],
      },
    ]
    expect(extractTemplateParams(components).carousel?.[0]?.button).toEqual([])
  })

  test("payment buttons coexist with limited-time-offer and document header", () => {
    const params = extractTemplateParams([
      { type: "HEADER", format: "DOCUMENT" },
      { type: "BODY", text: "Hi" },
      {
        type: "LIMITED_TIME_OFFER",
        limited_time_offer: { has_expiration: true },
      },
      { type: "BUTTONS", buttons: [boletoButton] },
    ])
    expect(params.header?.[0]?.type).toBe("document")
    expect(params.limited_time_offer).toEqual({ expiration_time_ms: 0 })
    expect(params.button?.[0]?.payment_request?.method).toBe("boleto")
  })
})

describe("waTemplateParamsSchema — payment_request shape", () => {
  const parse = (params: unknown) => waTemplateParamsSchema.safeParse(params)

  test("accepts a payment button with its data", () => {
    expect(
      parse({
        button: [
          {
            sub_type: "payment_request",
            index: 0,
            payment_request: { method: "pix", code: "{{pix}}" },
          },
        ],
      }).success,
    ).toBe(true)
  })

  test.each([
    [
      "payment data on a non-payment sub_type",
      {
        sub_type: "url",
        index: 0,
        text: "x",
        payment_request: { method: "pix", code: "x" },
      },
    ],
    [
      "payment sub_type without data",
      { sub_type: "payment_request", index: 0 },
    ],
    [
      "payment sub_type without an index",
      {
        sub_type: "payment_request",
        payment_request: { method: "pix", code: "x" },
      },
    ],
    [
      "unknown method",
      {
        sub_type: "payment_request",
        index: 0,
        payment_request: { method: "crypto", code: "x" },
      },
    ],
  ])("rejects %s", (_name, button) => {
    const result = parse({ button: [button] })
    expect(result.success).toBe(false)
  })

  test("rejects a payment request inside a carousel card", () => {
    const result = parse({
      carousel: [
        {
          card_index: 0,
          button: [
            {
              sub_type: "payment_request",
              index: 0,
              payment_request: { method: "pix", code: "x" },
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      flowValidationCodes.waTemplatePaymentRequestMisplaced,
    )
  })

  test("params saved before payment support (null holes, no payment data) still parse", () => {
    const result = parse({
      button: [null, { sub_type: "url", index: 1, text: "x" }],
    })
    expect(result.success).toBe(true)
    expect(result.data?.button).toEqual([
      { sub_type: "url", index: 1, text: "x" },
    ])
  })
})

describe("publish validation of payment requests", () => {
  const refinedStepSchema =
    sendWaTemplateMessageValidator[channelTypes.enum.omnichannel]
  const issuesFor = (params: WaTemplateParams) => {
    const result = refinedStepSchema.safeParse({
      id: "1",
      nodeId: "n1",
      stepType: stepTypes.enum.sendWaTemplateMessage,
      template: { id: "t", name: "t", language: "en", inboxId: null, params },
      buttons: [],
    })
    return result.success ? [] : result.error.issues.map((i) => i.message)
  }
  const withRequest = (payment_request: unknown): WaTemplateParams =>
    waTemplateParamsSchema.parse({
      button: [{ sub_type: "payment_request", index: 0, payment_request }],
    })

  test("a blank seeded request blocks publish", () => {
    expect(issuesFor(withRequest({ method: "pix", code: "" }))).toEqual([
      flowValidationCodes.waTemplatePaymentRequestIncomplete,
    ])
  })

  test("a malformed value blocks publish", () => {
    expect(
      issuesFor(withRequest({ method: "payment_link", url: "nope" })),
    ).toEqual([flowValidationCodes.waTemplatePaymentRequestInvalid])
  })

  test("variables and valid values pass", () => {
    expect(
      issuesFor(withRequest({ method: "pix", code: "{{pix_code}}" })),
    ).toEqual([])
    expect(
      issuesFor(
        withRequest({ method: "payment_link", url: "https://pay.test/1" }),
      ),
    ).toEqual([])
  })
})

describe("findPaymentRequestMismatches", () => {
  const components: TemplateComponent[] = [
    { type: "BODY", text: "Pay" },
    { type: "BUTTONS", buttons: [quickReply, pixButton, boletoButton] },
  ]
  const requestByMethod = {
    pix: { method: "pix", code: "x" },
    boleto: { method: "boleto", digitableLine: "1" },
    payment_link: { method: "payment_link", url: "https://a.test" },
  } as const
  const entry = (index: number, method: keyof typeof requestByMethod) => ({
    sub_type: "payment_request" as const,
    index,
    payment_request: requestByMethod[method],
  })
  const params = (
    ...buttons: ReturnType<typeof entry>[]
  ): WaTemplateParams => ({
    button: buttons,
  })

  test("exact one-to-one match, in any order, has no mismatch", () => {
    expect(
      findPaymentRequestMismatches(
        params(entry(2, "boleto"), entry(1, "pix")),
        components,
      ),
    ).toEqual([])
  })

  test.each([
    [
      "missing entry",
      params(entry(1, "pix")),
      [{ index: 2, reason: "missing" }],
    ],
    [
      "duplicate entry",
      params(entry(1, "pix"), entry(1, "pix"), entry(2, "boleto")),
      [{ index: 1, reason: "duplicate" }],
    ],
    [
      "wrong method",
      params(entry(1, "boleto"), entry(2, "boleto")),
      [{ index: 1, reason: "method_mismatch" }],
    ],
    [
      "extra entry",
      params(entry(1, "pix"), entry(2, "boleto"), entry(0, "pix")),
      [{ index: 0, reason: "extra" }],
    ],
  ])("reports %s", (_name, sent, expected) => {
    expect(findPaymentRequestMismatches(sent, components)).toEqual(expected)
  })

  test("a template payment button of unknown method can never be sent", () => {
    expect(
      findPaymentRequestMismatches(params(), [
        {
          type: "BUTTONS",
          buttons: [{ type: "PAYMENT_REQUEST", text: "Pay now" }],
        },
      ]),
    ).toEqual([{ index: 0, reason: "unsupported_template_button" }])
  })

  test("a template without payment buttons only flags stray entries", () => {
    expect(
      findPaymentRequestMismatches(params(), [{ type: "BODY", text: "Hi" }]),
    ).toEqual([])
    expect(
      findPaymentRequestMismatches(params(entry(0, "pix")), [
        { type: "BODY", text: "Hi" },
      ]),
    ).toEqual([{ index: 0, reason: "extra" }])
  })
})

describe("templateStructureKey — payment buttons", () => {
  const key = (button: Record<string, unknown>) =>
    templateStructureKey({
      name: "pay",
      language: "pt_BR",
      category: "UTILITY",
      components: [{ type: "BUTTONS", buttons: [button] }],
    })

  test("templates with different payment methods never share a structure", () => {
    expect(key(pixButton)).not.toBe(key(boletoButton))
  })

  test("same method with or without payment_setting shares a structure", () => {
    expect(key(pixButton)).toBe(
      key({ type: "PAYMENT_REQUEST", text: "Copy Pix code" }),
    )
  })

  test("non-payment buttons keep their structure key", () => {
    expect(key({ type: "QUICK_REPLY", text: "Hi" })).not.toContain(
      "paymentMethod",
    )
  })
})

describe("payment request mixed with quick replies", () => {
  const components: TemplateComponent[] = [
    {
      type: "BUTTONS",
      buttons: [
        { type: "QUICK_REPLY", text: "Later" },
        pixButton,
        { type: "QUICK_REPLY", text: "Stop" },
      ],
    },
  ]

  test("the payment slot keeps its template index and the quick replies bind around it", () => {
    const params = extractTemplateParams(components)
    expect(params.button).toEqual([
      {
        sub_type: "payment_request",
        index: 1,
        payment_request: { method: "pix", code: "" },
      },
    ])

    const laterButton = buttonStepDefaultFn({ label: "Later" })
    const stopButton = buttonStepDefaultFn({ label: "Stop" })
    const bound = bindWaTemplateQuickReplyButtons(components, [
      buttonStepDefaultFn({ label: "Delivered" }),
      buttonStepDefaultFn({ label: "Failed" }),
      laterButton,
      stopButton,
    ])

    expect(bound).toEqual([
      { templateButtonIndex: 0, stepButton: laterButton },
      { templateButtonIndex: 2, stepButton: stopButton },
    ])
  })
})

describe("payment link URL rule", () => {
  test.each([
    "https://pay.test/1",
    "myapp://pay/1",
    "{{pay_url}}",
    "https://pay.test/{{id}}",
    "not a url",
    "pay.test/1",
    "",
  ])("accepts exactly what zodUrlWithVariables accepts: %j", (url) => {
    const issues = collectPaymentRequestIssues(
      { method: "payment_link", url },
      { allowVariables: true },
    )
    const isUrlFormatValid = !issues.some(
      (issue) => issue.field === "url" && issue.kind === "invalid",
    )

    // A blank value is a "required" issue, not a format one.
    expect(isUrlFormatValid).toBe(
      url.trim() === "" || zodUrlWithVariables().safeParse(url).success,
    )
  })
})

describe("a payment template exactly as Meta returned it when synced", () => {
  // Captured from a real approved pt_BR Pix template (sample code shortened):
  // English label, upper-case payment_setting.type.
  const syncedComponents: TemplateComponent[] = [
    { type: "BODY", text: "Olá! Seu pedido está pronto." },
    {
      type: "BUTTONS",
      buttons: [
        {
          type: "PAYMENT_REQUEST",
          text: "Copy Pix code",
          payment_setting: { type: "PIX_DYNAMIC_CODE" },
        },
      ],
    },
  ]

  test("is recognised as a Pix button and seeded with a blank Pix request", () => {
    expect(extractTemplateParams(syncedComponents).button).toEqual([
      {
        sub_type: "payment_request",
        index: 0,
        payment_request: { method: "pix", code: "" },
      },
    ])
  })

  test("matches a Pix request one to one and rejects another method", () => {
    const pix = {
      button: [
        {
          sub_type: "payment_request" as const,
          index: 0,
          payment_request: { method: "pix" as const, code: "x" },
        },
      ],
    }
    expect(findPaymentRequestMismatches(pix, syncedComponents)).toEqual([])
    expect(
      findPaymentRequestMismatches(
        {
          button: [
            {
              sub_type: "payment_request",
              index: 0,
              payment_request: { method: "boleto", digitableLine: "1" },
            },
          ],
        },
        syncedComponents,
      ),
    ).toEqual([{ index: 0, reason: "method_mismatch" }])
  })

  test("shares a structure key with the same template written in lower case", () => {
    const key = (type: string) =>
      templateStructureKey({
        name: "pagamento_pix_teste",
        language: "pt_BR",
        category: "UTILITY",
        components: [
          {
            type: "BUTTONS",
            buttons: [
              {
                type: "PAYMENT_REQUEST",
                text: "Copy Pix code",
                payment_setting: { type },
              },
            ],
          },
        ],
      })

    expect(key("PIX_DYNAMIC_CODE")).toBe(key("pix_dynamic_code"))
  })
})
