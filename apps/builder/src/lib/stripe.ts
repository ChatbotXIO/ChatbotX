import Stripe from "stripe"

export const getStripeClient = (
  publishableKey: string,
  options?: Record<string, unknown>,
) => new Stripe(publishableKey, options)
