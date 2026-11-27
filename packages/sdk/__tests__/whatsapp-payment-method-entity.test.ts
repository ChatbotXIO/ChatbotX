import { describe, expect, test } from "vitest"
import { getWhatsappPaymentMethod } from "../src"

describe("getWhatsappPaymentMethod", () => {
  test("returns the entity of a payment confirmation", () => {
    const entity = {
      type: "whatsapp_payment_method",
      paymentMethod: "offsite_card_pay",
      raw: {},
    }
    expect(getWhatsappPaymentMethod(entity)).toBe(entity)
  })

  test.each([
    [undefined],
    [null],
    ["text"],
    [{}],
    [{ type: "other" }],
  ])("ignores %j", (value) => {
    expect(getWhatsappPaymentMethod(value)).toBeUndefined()
  })
})
