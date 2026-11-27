export type PaymentProviderName = "stripe" | "paypal"

/**
 * A store's Stripe account, connected to the platform with Stripe Connect
 * OAuth. Every call is made with the platform's secret key on behalf of the
 * account (`Stripe-Account`), so the money lands in the store's own account.
 */
export type StripeConnectedAccount = {
  platformSecretKey: string
  /** `acct_…`, Stripe's `stripe_user_id`. */
  accountId: string
}

/**
 * A store's own Stripe account, connected with the store's secret key:
 * every call is made with that key, with no `Stripe-Account`.
 */
export type StripeOwnAccount = {
  secretKey: string
}

/** What a store pastes in to connect Stripe with a key, plus what connecting adds. */
export type StripeKeySecret = {
  /** `sk_…` or a restricted `rk_…` key. */
  secretKey: string
  livemode: boolean
  /** `acct_…`, the account the key belongs to. */
  accountId: string
  /** The webhook created on connect, on the store's own account. */
  webhookId: string
  /** That webhook's signing secret (`whsec_…`). */
  webhookSecret: string
}

/** What a store pastes in to connect PayPal, plus what connecting adds. */
export type PaypalSecret = {
  clientId: string
  clientSecret: string
  livemode: boolean
  /** The webhook created on connect; PayPal verifies signatures against it. */
  webhookId: string
}

/** Who an attempt belongs to, carried by the provider and read back from it. */
export type PaymentMetadata = {
  workspaceId: string
  orderId: string
  orderPaymentId: string
}

export type CreateCheckoutInput = {
  /** Major units in `currency` (`12.5` USD), exactly the order's total. */
  amount: number
  /** ISO 4217, upper case. */
  currency: string
  /** What the customer sees on the provider's page, e.g. "Order #12". */
  description: string
  returnUrl: string
  cancelUrl: string
  /** Stripe closes its page then; PayPal pages do not expire this soon. */
  expiresAt: Date
  customerEmail?: string | null
  metadata: PaymentMetadata
  /** The same key never creates a second page. */
  idempotencyKey: string
}

export type CreatedCheckout = {
  /** Stripe Checkout Session id or PayPal order id. */
  reference: string
  url: string
}

/**
 * Where an attempt stands at the provider:
 * - `open` — the customer can still pay on the page;
 * - `processing` — the customer paid, the provider has not settled it yet;
 * - `paid` — the money is the store's (`transactionId` refunds it);
 * - `closed` — it can no longer be paid (expired, voided, declined).
 */
export type CheckoutStatus =
  | { state: "open" | "processing" | "closed" }
  | {
      state: "paid"
      transactionId: string
      /** What the customer paid, in the currency's provider minor units. */
      amountMinor: number
      /** ISO 4217, upper case. */
      currency: string
    }

export type RefundResult = {
  /** Null when the provider said it was already refunded. */
  refundId: string | null
}

/** A webhook request exactly as it arrived: the signature covers the raw body. */
export type PaymentWebhookRequest = {
  rawBody: string
  headers: Headers
}

/** A webhook the provider signed, reduced to what it is about. */
export type PaymentWebhookEvent =
  | {
      kind: "checkout"
      eventId: string
      /** The attempt it is about (session or PayPal order id). */
      reference: string
      /** Null for an attempt ChatbotX did not create. */
      metadata: PaymentMetadata | null
      /** Stripe: the connected account the event came from; null on a store's own webhook. */
      account: string | null
    }
  | {
      /** Stripe: the store disconnected the platform from its side. */
      kind: "deauthorized"
      eventId: string
      account: string
      /** When it happened, so a late event never removes a newer connection. */
      createdAt: Date
    }
  | { kind: "ignored"; eventId: string }

/** One store's account at one provider. */
export interface PaymentGateway {
  createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout>
  /** Closes the page so it can no longer be paid; returns where it ended. */
  expireCheckout(reference: string): Promise<CheckoutStatus>
  /**
   * Reads the attempt. With `capture`, an approved PayPal order is captured
   * first (taking the money); Stripe takes it on its page by itself.
   */
  getCheckoutStatus(
    reference: string,
    options?: { capture?: { idempotencyKey: string } },
  ): Promise<CheckoutStatus>
  readonly provider: PaymentProviderName
  /** A full refund of a paid attempt. The same key never refunds twice. */
  refund(input: {
    transactionId: string
    idempotencyKey: string
  }): Promise<RefundResult>
  /** Provider minor units for `amount`, or `amountUnsupported` if inexact. */
  toMinorUnits(amount: number, currency: string): number
}
