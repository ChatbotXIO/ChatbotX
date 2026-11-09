import { expect, test } from "vitest"
import {
  toEcommerceSettingsPatch,
  updateEcommerceSettingsPublicRequest,
} from "@/features/ecommerce-settings/schema/public"

test("the deprecated Shopify checkout keys still update the shared settings", () => {
  const patch = toEcommerceSettingsPatch(
    updateEcommerceSettingsPublicRequest.parse({
      checkout: {
        shopifyCheckoutMethod: "inApp",
        shopifyAutoApplyDiscounts: false,
      },
    }),
  )
  expect(patch.checkout).toEqual({
    externalCheckoutMethod: "inApp",
    externalAutoApplyDiscounts: false,
  })
})

test("the new keys win over the deprecated ones", () => {
  const patch = toEcommerceSettingsPatch(
    updateEcommerceSettingsPublicRequest.parse({
      checkout: {
        externalCheckoutMethod: "webCheckout",
        shopifyCheckoutMethod: "inApp",
      },
    }),
  )
  expect(patch.checkout?.externalCheckoutMethod).toBe("webCheckout")
})

test("a patch without checkout is left as it is", () => {
  const patch = toEcommerceSettingsPatch(
    updateEcommerceSettingsPublicRequest.parse({
      general: { orderingAvailable: true },
    }),
  )
  expect(patch).toEqual({
    general: { orderingAvailable: true },
    checkout: undefined,
  })
})
