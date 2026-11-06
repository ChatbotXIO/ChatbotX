import {
  fulfillmentStatuses,
  paymentStatuses,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

export const cancelOrderRequest = z.object({
  message: z.string().trim().max(1000).nullish(),
})

export const transitionOrderRequest = cancelOrderRequest.extend({
  to: z.enum(["accepted", "shipped", "concluded"]),
})
export type TransitionOrderRequest = z.infer<typeof transitionOrderRequest>

export const exportOrdersRequest = z.object({
  keyword: z.string().trim().max(255).nullish(),
  paymentStatus: z.array(paymentStatuses).optional(),
  fulfillmentStatus: z.array(fulfillmentStatuses).optional(),
})
export type ExportOrdersRequest = z.infer<typeof exportOrdersRequest>
