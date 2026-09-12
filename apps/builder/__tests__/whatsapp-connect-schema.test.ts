// @vitest-environment node
import { describe, expect, test } from "vitest"
import { connectWhatsappSchema } from "@/features/integration-whatsapp/schema"

const baseManualInput = {
  connectExisting: true,
  transferPhoneNumber: false,
  manualConnect: true,
  marketingMessageLite: true,
  wabaId: "waba-1",
  phoneNumberId: "phone-1",
  accessToken: "token",
}

describe("connectWhatsappSchema — manualAppSecret", () => {
  test("is optional: a manual connect without it still validates", () => {
    const result = connectWhatsappSchema.safeParse(baseManualInput)

    expect(result.success).toBe(true)
    expect(result.success && result.data.manualAppSecret).toBeFalsy()
  })

  test("round-trips a provided app secret unchanged (trimmed)", () => {
    const result = connectWhatsappSchema.safeParse({
      ...baseManualInput,
      manualAppSecret: "  owner-supplied-app-secret  ",
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.manualAppSecret).toBe(
      "owner-supplied-app-secret",
    )
  })

  test("is accepted on the non-manual (OAuth code) flow too, even though nothing reads it there", () => {
    const result = connectWhatsappSchema.safeParse({
      connectExisting: false,
      transferPhoneNumber: false,
      manualConnect: false,
      marketingMessageLite: true,
      code: "oauth-code",
      manualAppSecret: "ignored-on-this-path",
    })

    expect(result.success).toBe(true)
  })
})
