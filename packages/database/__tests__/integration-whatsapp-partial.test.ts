import { describe, expect, test } from "vitest"
import { whatsappRegistrationErrorSchema } from "../src/partials/integration-whatsapp"
import type { IntegrationWhatsappRegistrationError } from "../src/schema/integration-whatsapp"

describe("whatsappRegistrationErrorSchema", () => {
  test("accepts the full shape stored on IntegrationWhatsapp.registrationError", () => {
    const value: IntegrationWhatsappRegistrationError = {
      code: 100,
      subCode: 2_593_005,
      message: "Invalid parameter",
      type: "OAuthException",
      userTitle: "Phone number is not verified",
      userMessage: "Phone number is not verified through SMS or voice.",
      fbtraceId: "trace-1",
      at: "2026-07-27T08:00:00.000Z",
    }

    expect(whatsappRegistrationErrorSchema.parse(value)).toEqual(value)
  })

  test("accepts the minimal required shape — string code, null subCode, no optional fields", () => {
    const value: IntegrationWhatsappRegistrationError = {
      code: "systemError",
      subCode: null,
      message: "Something went wrong",
      at: "2026-07-27T08:00:00.000Z",
    }

    expect(whatsappRegistrationErrorSchema.parse(value)).toEqual(value)
  })

  test("rejects a payload missing the required message field", () => {
    expect(() =>
      whatsappRegistrationErrorSchema.parse({
        code: 1,
        subCode: null,
        at: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow()
  })

  test("stays in sync with the column's declared type — a parsed value satisfies IntegrationWhatsappRegistrationError", () => {
    const parsed = whatsappRegistrationErrorSchema.parse({
      code: 1,
      subCode: null,
      message: "x",
      at: "2026-01-01T00:00:00.000Z",
    })
    const typedBack: IntegrationWhatsappRegistrationError = parsed

    expect(typedBack.code).toBe(1)
    expect(typedBack.subCode).toBeNull()
  })
})
