import { onlinePaymentProviders } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const paymentProviderResource = z.object({
  provider: onlinePaymentProviders,
  livemode: z
    .boolean()
    .describe("False for a Stripe test connection or the PayPal sandbox."),
  accountLabel: z
    .string()
    .nullable()
    .describe(
      "The Stripe account's name, or the PayPal Client ID with most of it hidden.",
    ),
  accountId: z
    .string()
    .nullable()
    .describe("The connected Stripe account (`acct_…`); null for PayPal."),
  connectedAt: z.date(),
})
export type PaymentProviderResource = z.infer<typeof paymentProviderResource>

export const listPaymentProvidersResponse = z.object({
  data: z.array(paymentProviderResource),
  stripeAvailable: z
    .boolean()
    .describe("Whether this platform has Stripe Connect set up."),
})

export const paymentProviderConnectLinkRequest = z.object({
  provider: onlinePaymentProviders.describe("Which provider to connect."),
})

export const paymentProviderConnectLinkResponse = z.object({
  url: z
    .string()
    .describe(
      "The provider's row on Settings → Integrations, for a super admin of the workspace to open and press Connect.",
    ),
})

/** The PayPal dialog's fields (UI only: see `paymentProviders.getConnectLink`). */
export const connectPaypalRequest = z.object({
  clientId: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .describe("The REST app's Client ID from developer.paypal.com."),
  clientSecret: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .describe("The REST app's Secret. Stored encrypted, never returned."),
})

export const disconnectPaymentProviderRequest = z.object({
  provider: onlinePaymentProviders.describe("Which provider to disconnect."),
})
