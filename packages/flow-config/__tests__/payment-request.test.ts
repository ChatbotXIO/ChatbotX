import { describe, expect, test } from "vitest"
import {
  collectPaymentRequestIssues,
  createEmptyPaymentRequest,
  type PaymentRequest,
  paymentAmountToMinorUnits,
  paymentRequestMethods,
  paymentRequestSchema,
} from "../src"

describe("paymentAmountToMinorUnits", () => {
  test.each([
    ["12.34", 1234],
    ["10", 1000],
    ["0.5", 50],
    ["0.01", 1],
    [" 7.10 ", 710],
    ["9007199254740991", null], // x100 overflows a safe integer
    ["90071992547409.91", 9_007_199_254_740_991],
  ])("%s → %s", (amount, expected) => {
    expect(paymentAmountToMinorUnits(amount)).toBe(expected)
  })

  test.each([
    "0",
    "0.00",
    "-1",
    "1.234",
    "abc",
    "1e3",
    "",
    ".5",
    "1,5",
    "99999999999999999999",
  ])("rejects %j", (amount) => {
    expect(paymentAmountToMinorUnits(amount)).toBeNull()
  })

  test("honours the currency's fraction digits", () => {
    expect(paymentAmountToMinorUnits("1500", 0)).toBe(1500)
    expect(paymentAmountToMinorUnits("1.5", 0)).toBeNull()
    expect(paymentAmountToMinorUnits("1.234", 3)).toBe(1234)
  })
})

describe("paymentRequestSchema", () => {
  test("rejects fields a method does not carry", () => {
    expect(
      paymentRequestSchema.safeParse({
        method: "boleto",
        digitableLine: "1",
        amount: "10",
      }).success,
    ).toBe(false)
  })
})

describe("createEmptyPaymentRequest", () => {
  test.each(
    paymentRequestMethods.options,
  )("%s seed parses with the schema and is not shared", (method) => {
    const request = createEmptyPaymentRequest(method)
    expect(paymentRequestSchema.safeParse(request).success).toBe(true)
    expect(createEmptyPaymentRequest(method)).not.toBe(request)
  })
})

const editing = { allowVariables: true }
const sending = { allowVariables: false }

describe("collectPaymentRequestIssues", () => {
  test("blank required values are required issues, optional ones are not", () => {
    expect(
      collectPaymentRequestIssues(createEmptyPaymentRequest("pix"), editing),
    ).toEqual([{ field: "code", kind: "required" }])
    expect(
      collectPaymentRequestIssues(
        createEmptyPaymentRequest("card_on_file"),
        editing,
      ),
    ).toEqual([
      { field: "lastFourDigits", kind: "required" },
      { field: "amount", kind: "required" },
    ])
  })

  test("valid requests have no issues", () => {
    const requests: PaymentRequest[] = [
      { method: "pix", code: "000201", amount: "10.50" },
      { method: "pix", code: "000201" },
      { method: "boleto", digitableLine: "1234.5678" },
      { method: "payment_link", url: "https://pay.test/x" },
      { method: "payment_link", url: "myapp://pay/1" },
      {
        method: "card_on_file",
        lastFourDigits: "4242",
        credentialId: "cred",
        amount: "5",
      },
    ]
    for (const request of requests) {
      expect(collectPaymentRequestIssues(request, sending)).toEqual([])
    }
  })

  test("flags malformed amount, url and last four digits", () => {
    expect(
      collectPaymentRequestIssues(
        { method: "pix", code: "x", amount: "1.234" },
        editing,
      ),
    ).toEqual([{ field: "amount", kind: "invalid" }])
    expect(
      collectPaymentRequestIssues(
        { method: "payment_link", url: "not a url" },
        editing,
      ),
    ).toEqual([{ field: "url", kind: "invalid" }])
    expect(
      collectPaymentRequestIssues(
        { method: "card_on_file", lastFourDigits: "42", amount: "5" },
        editing,
      ),
    ).toEqual([{ field: "lastFourDigits", kind: "invalid" }])
  })

  test("variables are accepted while editing and rejected when sending", () => {
    const request: PaymentRequest = {
      method: "payment_link",
      url: "{{pay_url}}",
    }
    expect(collectPaymentRequestIssues(request, editing)).toEqual([])
    expect(collectPaymentRequestIssues(request, sending)).toEqual([
      { field: "url", kind: "unresolved" },
    ])
    expect(
      collectPaymentRequestIssues(
        { method: "pix", code: "000{{unknown}}" },
        sending,
      ),
    ).toEqual([{ field: "code", kind: "unresolved" }])
  })

  test("whitespace-only values count as blank", () => {
    expect(
      collectPaymentRequestIssues(
        { method: "boleto", digitableLine: "  " },
        sending,
      ),
    ).toEqual([{ field: "digitableLine", kind: "required" }])
  })
})
