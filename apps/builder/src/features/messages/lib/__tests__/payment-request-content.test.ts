import { describe, expect, test } from "vitest"
import {
  formatPaymentRequestAmount,
  getSentPaymentRequests,
  getSentTemplateName,
  isOpenableUrl,
  paymentRequestMainValue,
} from "../payment-request-content"

const PIX_CODE = "00020126580014br.gov.bcb.pix0136123e4567"

const templateMessage = (button: unknown[]) => ({
  type: "whatsapp_template",
  template: { id: "t-1", name: "pagamento_pix_teste", params: { button } },
})

describe("getSentPaymentRequests", () => {
  test("reads only the payment request buttons, keeping their index", () => {
    const requests = getSentPaymentRequests(
      templateMessage([
        { sub_type: "quick_reply", index: 0, payload: "x" },
        {
          sub_type: "payment_request",
          index: 1,
          payment_request: { method: "pix", code: PIX_CODE, amount: "1.00" },
        },
      ]),
    )

    expect(requests).toEqual([
      {
        index: 1,
        request: { method: "pix", code: PIX_CODE, amount: "1.00" },
      },
    ])
  })

  test("skips a payment button whose stored data does not parse", () => {
    const requests = getSentPaymentRequests(
      templateMessage([
        { sub_type: "payment_request", index: 0, payment_request: {} },
        {
          sub_type: "payment_request",
          index: 1,
          payment_request: { method: "boleto" },
        },
      ]),
    )

    expect(requests).toEqual([])
  })

  test("falls back to the button position when the index is missing", () => {
    const requests = getSentPaymentRequests(
      templateMessage([
        {
          sub_type: "payment_request",
          payment_request: {
            method: "payment_link",
            url: "https://pay.example",
          },
        },
      ]),
    )

    expect(requests[0]?.index).toBe(0)
  })

  test.each([
    null,
    "text",
    { type: "template", template: { params: { button: [] } } },
    { type: "whatsapp_template" },
    { type: "whatsapp_template", template: { params: { button: "x" } } },
  ])("returns nothing for a message that is not a payment template (%j)", (attrs) => {
    expect(getSentPaymentRequests(attrs)).toEqual([])
  })
})

describe("getSentTemplateName", () => {
  test("returns the stored template name, or null", () => {
    expect(getSentTemplateName(templateMessage([]))).toBe("pagamento_pix_teste")
    expect(getSentTemplateName({ template: { name: "" } })).toBeNull()
    expect(getSentTemplateName(null)).toBeNull()
  })
})

describe("formatPaymentRequestAmount", () => {
  test("formats the amount in BRL for the viewer's locale", () => {
    const request = { method: "pix", code: PIX_CODE, amount: "1234.5" } as const

    // Intl separates the symbol with a no-break space (U+00A0).
    expect(formatPaymentRequestAmount("pt-BR", request)).toBe("R$ 1.234,50")
    expect(formatPaymentRequestAmount("en", request)).toBe("R$1,234.50")
  })

  test("returns null without an amount or for an invalid one", () => {
    expect(
      formatPaymentRequestAmount("en", { method: "pix", code: PIX_CODE }),
    ).toBeNull()
    expect(
      formatPaymentRequestAmount("en", {
        method: "card_on_file",
        lastFourDigits: "4242",
        amount: "12.345",
      }),
    ).toBeNull()
    expect(
      formatPaymentRequestAmount("en", {
        method: "boleto",
        digitableLine: "123",
      }),
    ).toBeNull()
  })
})

describe("paymentRequestMainValue", () => {
  test("returns the value the customer copies or opens", () => {
    expect(paymentRequestMainValue({ method: "pix", code: PIX_CODE })).toBe(
      PIX_CODE,
    )
    expect(
      paymentRequestMainValue({ method: "boleto", digitableLine: "2379" }),
    ).toBe("2379")
    expect(
      paymentRequestMainValue({
        method: "payment_link",
        url: "https://pay.example",
      }),
    ).toBe("https://pay.example")
  })
})

describe("isOpenableUrl", () => {
  test("only http(s) links are openable", () => {
    expect(isOpenableUrl("https://pay.example/x")).toBe(true)
    expect(isOpenableUrl("http://pay.example/x")).toBe(true)
    expect(isOpenableUrl("javascript:alert(1)")).toBe(false)
    expect(isOpenableUrl("not a url")).toBe(false)
  })
})
