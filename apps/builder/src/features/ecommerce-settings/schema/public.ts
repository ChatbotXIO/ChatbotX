import {
  ecommerceCheckoutSettingsSchema,
  ecommerceGeneralSettingsSchema,
  ecommercePaymentSettingsSchema,
  ecommerceProFeatures,
  ecommerceSettingsSchema,
  ecommerceShippingSettingsSchema,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

export const ecommerceSettingsPublicResource = ecommerceSettingsSchema.extend({
  proFeatures: z
    .record(ecommerceProFeatures, z.boolean())
    .describe("Which Pro settings this workspace may turn on."),
  productsInOtherCurrency: z
    .number()
    .describe(
      "Products priced in a currency other than `payments.currency`. Orders still charge their price in the store currency.",
    ),
})
export type EcommerceSettingsPublicResource = z.infer<
  typeof ecommerceSettingsPublicResource
>

export const updateEcommerceSettingsPublicRequest = z.object({
  general: ecommerceGeneralSettingsSchema
    .partial()
    .optional()
    .describe("Ordering, web shop display and Pro features."),
  payments: ecommercePaymentSettingsSchema
    .partial()
    .optional()
    .describe("Payment methods, currency and service fee."),
  shipping: ecommerceShippingSettingsSchema
    .partial()
    .optional()
    .describe("Delivery or pickup, countries and delivery cost."),
  checkout: ecommerceCheckoutSettingsSchema
    .partial()
    .extend({
      shopifyCheckoutMethod:
        ecommerceCheckoutSettingsSchema.shape.externalCheckoutMethod
          .optional()
          .describe("Deprecated: use `externalCheckoutMethod`."),
      shopifyAutoApplyDiscounts: z
        .boolean()
        .optional()
        .describe("Deprecated: use `externalAutoApplyDiscounts`."),
    })
    .optional()
    .describe("Checkout mode, minimum order and required buyer fields."),
})

/**
 * The patch the service takes: the deprecated Shopify-only checkout keys
 * (renamed when WooCommerce joined) still work, the new name winning when
 * both are sent.
 */
export const toEcommerceSettingsPatch = (
  input: UpdateEcommerceSettingsRequest,
) => {
  if (!input.checkout) {
    return { ...input, checkout: undefined }
  }
  const { shopifyCheckoutMethod, shopifyAutoApplyDiscounts, ...checkout } =
    input.checkout
  return {
    ...input,
    checkout: {
      ...checkout,
      externalCheckoutMethod:
        checkout.externalCheckoutMethod ?? shopifyCheckoutMethod,
      externalAutoApplyDiscounts:
        checkout.externalAutoApplyDiscounts ?? shopifyAutoApplyDiscounts,
    },
  }
}
export type UpdateEcommerceSettingsRequest = z.infer<
  typeof updateEcommerceSettingsPublicRequest
>
