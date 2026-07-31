import { describe, expect, test } from "vitest"
import { buildWhatsappPhoneName } from "../phone-name"

describe("buildWhatsappPhoneName", () => {
  test("appends the last three digits of the phone number to the verified name", () => {
    expect(
      buildWhatsappPhoneName({
        verifiedName: "BNN BotX",
        displayPhoneNumber: "84348721855",
      }),
    ).toBe("BNN BotX - 855")
  })

  test("falls back to the phone number when the verified name is blank", () => {
    expect(
      buildWhatsappPhoneName({
        verifiedName: " ",
        displayPhoneNumber: "84348721855",
      }),
    ).toBe("84348721855 - 855")
  })
})
