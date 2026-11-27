import { describe, expect, test, vi } from "vitest"

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))
vi.mock("../src/lib/logger", () => ({ logger: mockLogger }))

const { readInteractiveReply } = await import(
  "../src/handlers/message/incoming-reply"
)

type InteractiveReply = Parameters<typeof readInteractiveReply>[0]

const paymentMethodReply = (payment_method: unknown) =>
  ({ type: "payment_method", payment_method }) as unknown as InteractiveReply

describe("readInteractiveReply payment_method", () => {
  test("maps the documented one-click confirmation to a typed entity", () => {
    const raw = {
      payment_method: "offsite_card_pay",
      payment_timestamp: 1_726_170_122,
      reference_id: "ref-1",
      last_four_digits: "5235",
      credential_id: "1234567",
    }

    const result = readInteractiveReply(paymentMethodReply(raw))

    expect(result.postbackAction).toBeNull()
    expect(result.buttonTitle).toBeNull()
    expect(result.text).toBe(
      "Customer confirmed card payment ending 5235 (not charged yet)",
    )
    expect(result.contentAttributes).toEqual({
      type: "whatsapp_payment_method",
      paymentMethod: "offsite_card_pay",
      lastFourDigits: "5235",
      credentialId: "1234567",
      referenceId: "ref-1",
      paymentTimestamp: 1_726_170_122,
      raw,
    })
  })

  test("a payload without reference_id is still accepted", () => {
    const result = readInteractiveReply(
      paymentMethodReply({
        payment_method: "offsite_card_pay",
        credential_id: "cred-1",
      }),
    )

    expect(result.text).toBe("Customer confirmed payment (not charged yet)")
    expect(result.contentAttributes).toMatchObject({
      type: "whatsapp_payment_method",
      credentialId: "cred-1",
      referenceId: undefined,
      lastFourDigits: undefined,
    })
  })

  test("a timestamp sent as a string is read, a garbage one is dropped", () => {
    const parsed = readInteractiveReply(
      paymentMethodReply({
        payment_method: "offsite_card_pay",
        payment_timestamp: "1726170122",
      }),
    )
    const garbage = readInteractiveReply(
      paymentMethodReply({
        payment_method: "offsite_card_pay",
        payment_timestamp: "soon",
      }),
    )

    expect(parsed.contentAttributes).toMatchObject({
      paymentTimestamp: 1_726_170_122,
    })
    expect(garbage.contentAttributes).toMatchObject({
      paymentTimestamp: undefined,
    })
  })

  test("an unknown payment method value keeps the raw object", () => {
    const raw = { payment_method: "future_method", extra: { nested: true } }

    const result = readInteractiveReply(paymentMethodReply(raw))

    expect(result.contentAttributes).toMatchObject({
      type: "whatsapp_payment_method",
      paymentMethod: "future_method",
      raw,
    })
  })

  test("a payload missing the method name still records the raw object", () => {
    const raw = { credential_id: "cred-1" }

    const result = readInteractiveReply(paymentMethodReply(raw))

    expect(result.contentAttributes).toMatchObject({
      paymentMethod: "unknown",
      credentialId: "cred-1",
      raw,
    })
  })

  test.each([
    [null, null],
    ["offsite_card_pay", "offsite_card_pay"],
    [["cred-1"], ["cred-1"]],
    [undefined, null],
  ])("a non-object payload (%j) falls back to the unhandled text and keeps its raw value", (payload, kept) => {
    const result = readInteractiveReply(paymentMethodReply(payload))

    expect(result.text).toBe("Received interactive (coming soon)")
    expect(result.postbackAction).toBeNull()
    expect(result.contentAttributes).toEqual({
      unhandledInteractive: { type: "payment_method", payment_method: kept },
    })
  })

  test("never logs the payment data, even for a malformed payload", () => {
    readInteractiveReply(paymentMethodReply(["secret-credential"]))
    readInteractiveReply(
      paymentMethodReply({ credential_id: "secret-credential" }),
    )

    expect(
      JSON.stringify(Object.values(mockLogger).map((fn) => fn.mock.calls)),
    ).not.toContain("secret-credential")
  })

  test("does not disturb other interactive replies", () => {
    const result = readInteractiveReply({
      type: "button_reply",
      button_reply: { id: "btn-1", title: "Yes" },
    } as unknown as InteractiveReply)

    expect(result).toEqual({
      postbackAction: "btn-1",
      text: "Yes",
      buttonTitle: "Yes",
    })
  })
})
