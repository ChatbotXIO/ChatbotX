import Stripe from "stripe"

export const getStripeClient = (
  publishableKey: string,
  options?: Stripe.StripeConfig,
) => {
  return new Stripe(publishableKey, options)
}
