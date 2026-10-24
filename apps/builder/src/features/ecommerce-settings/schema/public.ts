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
    .optional()
    .describe("Checkout mode, minimum order and required buyer fields."),
})
export type UpdateEcommerceSettingsRequest = z.infer<
  typeof updateEcommerceSettingsPublicRequest
>
