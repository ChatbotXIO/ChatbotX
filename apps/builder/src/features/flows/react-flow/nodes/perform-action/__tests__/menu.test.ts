import { stepTypes } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import type { TranslationFn } from "../../types"
import { performActionMenus } from "../menu"

const t = ((key: string) => key) as unknown as TranslationFn

describe("perform action SendGrid registration", () => {
  test("exposes Add Contact to SendGrid in email actions", () => {
    const emailActions = performActionMenus(t).find(
      (item) => item.label === "flows.actions.emailActions",
    )
    expect(emailActions?.children).toContainEqual(
      expect.objectContaining({
        label: "flows.actions.sendGridAddContact",
        stepType: stepTypes.enum.sendGridAddContact,
      }),
    )
  })
})

describe("perform action coupon menu", () => {
  test("exposes topic coupon under tools as the create path", () => {
    const tools = performActionMenus(t).find(
      (item) => item.label === "flows.actions.tools",
    )

    expect(tools?.children).toContainEqual(
      expect.objectContaining({
        label: "coupons.tabs.topicCoupon",
        stepType: stepTypes.enum.setUpCoupon,
      }),
    )
    expect(
      performActionMenus(t).some(
        (item) => item.stepType === stepTypes.enum.setUpCoupon,
      ),
    ).toBe(false)
  })
})
