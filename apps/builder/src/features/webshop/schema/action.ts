import {
  orderShippingAddressSchema,
  shippingTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const shopRequest = z.object({
  workspaceId: zodBigintAsString(),
  token: z.string().min(1).max(4096),
})

export const changeCartRequest = shopRequest.extend({
  mode: z.enum(["add", "set"]),
  productId: zodBigintAsString(),
  variantId: zodBigintAsString().nullable(),
  quantity: z.number().int().min(0).max(10_000),
})

export const checkoutRequest = shopRequest.extend({
  customerName: z.string().trim().max(255).optional(),
  customerEmail: z.union([z.literal(""), z.email().max(255)]).optional(),
  customerPhone: z.string().trim().max(64).optional(),
  shippingType: shippingTypes.optional(),
  shippingAddress: orderShippingAddressSchema.optional(),
  note: z.string().trim().max(2000).optional(),
})

export const rateOrderRequest = shopRequest.extend({
  orderId: zodBigintAsString(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
})

export const applyDiscountCodeRequest = shopRequest.extend({
  code: z.string().trim().min(1).max(64),
  shippingType: shippingTypes.optional(),
})

export const removeDiscountCodeRequest = shopRequest
