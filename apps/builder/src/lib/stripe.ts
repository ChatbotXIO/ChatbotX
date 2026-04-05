import Stripe from "stripe"

export const getStripeClient = (
  publishableKey: string,
  options?: Record<string, unknown>,
) => {
  return new Stripe(publishableKey, options)
}
