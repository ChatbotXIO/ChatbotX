import { z } from "zod"

export const cancelOrderRequest = z.object({
  message: z.string().trim().max(1000).nullish(),
})

export const transitionOrderRequest = cancelOrderRequest.extend({
  to: z.enum(["accepted", "shipped", "concluded"]),
})
export type TransitionOrderRequest = z.infer<typeof transitionOrderRequest>
