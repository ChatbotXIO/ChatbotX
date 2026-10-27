import Stripe from "stripe"
import { PaymentProviderError } from "./errors"
import { toStripeMinorUnits } from "./minor-units"
import type {
  CheckoutStatus,
  CreateCheckoutInput,
  CreatedCheckout,
  PaymentGateway,
  PaymentMetadata,
  PaymentWebhookEvent,
  PaymentWebhookRequest,
  RefundResult,
  StripeConnectedAccount,
} from "./types"

/** The events the platform's Connect webhook listens to. */
export const STRIPE_CONNECT_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "account.application.deauthorized",
] as const

const CHECKOUT_SESSION_EVENTS: ReadonlySet<string> = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
])

/** Stripe refuses a refund of a payment already refunded with this. */
const ALREADY_REFUNDED_CODE = "charge_already_refunded"

const AMOUNT_CODES = new Set([
  "amount_too_small",
  "amount_too_large",
  "invalid_currency",
  "currency_not_supported",
])

export type StripeClientOptions = {
  /** Tests answer Stripe's HTTP calls with this. */
  fetch?: typeof fetch
}

const createClient = (secretKey: string, options?: StripeClientOptions) =>
  new Stripe(secretKey, {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "ChatbotX" },
    ...(options?.fetch
      ? { httpClient: Stripe.createFetchHttpClient(options.fetch) }
      : {}),
  })

/** Stripe's own errors, reduced to what the caller can act on. */
const toProviderError = (error: unknown): PaymentProviderError => {
  if (error instanceof PaymentProviderError) {
    return error
  }
  if (error instanceof Stripe.errors.StripeError) {
    const code = error.code ?? null
    const options = { providerCode: code, cause: error }
    if (
      error instanceof Stripe.errors.StripeAuthenticationError ||
      error instanceof Stripe.errors.StripePermissionError ||
      error instanceof Stripe.errors.StripeOAuthError
    ) {
      return new PaymentProviderError(
        "credentialsRejected",
        error.message,
        options,
      )
    }
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      return new PaymentProviderError(
        "signatureInvalid",
        error.message,
        options,
      )
    }
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return new PaymentProviderError(
        code && AMOUNT_CODES.has(code) ? "amountUnsupported" : "invalidRequest",
        error.message,
        options,
      )
    }
    if (error instanceof Stripe.errors.StripeCardError) {
      return new PaymentProviderError("invalidRequest", error.message, options)
    }
    return new PaymentProviderError("unavailable", error.message, options)
  }
  return new PaymentProviderError(
    "unavailable",
    error instanceof Error ? error.message : "Stripe did not answer.",
    { cause: error },
  )
}

const callStripe = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw toProviderError(error)
  }
}

const readMetadata = (
  metadata: Stripe.Metadata | null | undefined,
): PaymentMetadata | null => {
  const workspaceId = metadata?.workspaceId
  const orderId = metadata?.orderId
  const orderPaymentId = metadata?.orderPaymentId
  return workspaceId && orderId && orderPaymentId
    ? { workspaceId, orderId, orderPaymentId }
    : null
}

const toCheckoutStatus = (session: Stripe.Checkout.Session): CheckoutStatus => {
  if (session.payment_status === "paid") {
    const paymentIntent = session.payment_intent
    const transactionId =
      typeof paymentIntent === "string" ? paymentIntent : paymentIntent?.id
    if (!(transactionId && session.currency) || session.amount_total === null) {
      throw new PaymentProviderError(
        "invalidRequest",
        `Stripe reports session ${session.id} paid without its payment.`,
      )
    }
    return {
      state: "paid",
      transactionId,
      amountMinor: session.amount_total,
      currency: session.currency.toUpperCase(),
    }
  }
  if (session.status === "expired") {
    return { state: "closed" }
  }
  // Completed but not paid yet: a delayed payment method still settling.
  if (session.status === "complete") {
    return { state: "processing" }
  }
  return { state: "open" }
}

/**
 * One store's connected Stripe account. Every request carries
 * `Stripe-Account`, so the session, the payment and any refund live in the
 * store's account and the money is theirs.
 */
export const createStripeGateway = (
  account: StripeConnectedAccount,
  options?: StripeClientOptions,
): PaymentGateway => {
  const client = createClient(account.platformSecretKey, options)
  const onAccount = { stripeAccount: account.accountId }

  const getCheckoutStatus = async (
    reference: string,
  ): Promise<CheckoutStatus> =>
    toCheckoutStatus(
      await callStripe(() =>
        client.checkout.sessions.retrieve(reference, {}, onAccount),
      ),
    )

  return {
    provider: "stripe",

    toMinorUnits: toStripeMinorUnits,

    async createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout> {
      // One line for the whole order, so Stripe charges exactly its total.
      const unitAmount = toStripeMinorUnits(input.amount, input.currency)
      const session = await callStripe(() =>
        client.checkout.sessions.create(
          {
            mode: "payment",
            // Cards (wallets included) settle at once: an order is paid or
            // not by the time the customer comes back.
            payment_method_types: ["card"],
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: input.currency.toLowerCase(),
                  unit_amount: unitAmount,
                  product_data: { name: input.description },
                },
              },
            ],
            success_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            expires_at: Math.floor(input.expiresAt.getTime() / 1000),
            client_reference_id: input.metadata.orderPaymentId,
            ...(input.customerEmail
              ? { customer_email: input.customerEmail }
              : {}),
            metadata: input.metadata,
            payment_intent_data: { metadata: input.metadata },
          },
          { ...onAccount, idempotencyKey: input.idempotencyKey },
        ),
      )
      if (!session.url) {
        throw new PaymentProviderError(
          "invalidRequest",
          `Stripe created session ${session.id} without a page.`,
        )
      }
      return { reference: session.id, url: session.url }
    },

    getCheckoutStatus,

    async expireCheckout(reference: string): Promise<CheckoutStatus> {
      try {
        return toCheckoutStatus(
          await client.checkout.sessions.expire(reference, {}, onAccount),
        )
      } catch (error) {
        // Only an open session can be expired: one already paid or expired
        // is refused, and its status says which.
        if (error instanceof Stripe.errors.StripeInvalidRequestError) {
          return await getCheckoutStatus(reference)
        }
        throw toProviderError(error)
      }
    },

    async refund(input): Promise<RefundResult> {
      try {
        const refund = await client.refunds.create(
          { payment_intent: input.transactionId },
          { ...onAccount, idempotencyKey: input.idempotencyKey },
        )
        return { refundId: refund.id }
      } catch (error) {
        if (
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.code === ALREADY_REFUNDED_CODE
        ) {
          return { refundId: null }
        }
        throw toProviderError(error)
      }
    },
  }
}

/**
 * Checks the signature of an event the platform's Connect webhook received
 * and reduces it to what it is about. `account` is the connected account the
 * event came from; the caller matches it to the store.
 */
export const parseStripeConnectWebhook = async (
  input: PaymentWebhookRequest & {
    platformSecretKey: string
    webhookSecret: string
  },
  options?: StripeClientOptions,
): Promise<PaymentWebhookEvent> => {
  const signature = input.headers.get("stripe-signature")
  if (!signature) {
    throw new PaymentProviderError(
      "signatureInvalid",
      "The Stripe-Signature header is missing.",
    )
  }
  const client = createClient(input.platformSecretKey, options)
  const event = await callStripe(() =>
    client.webhooks.constructEventAsync(
      input.rawBody,
      signature,
      input.webhookSecret,
    ),
  )
  if (event.type === "account.application.deauthorized" && event.account) {
    return {
      kind: "deauthorized",
      eventId: event.id,
      account: event.account,
      createdAt: new Date(event.created * 1000),
    }
  }
  if (!CHECKOUT_SESSION_EVENTS.has(event.type)) {
    return { kind: "ignored", eventId: event.id }
  }
  const session = event.data.object as Stripe.Checkout.Session
  return {
    kind: "checkout",
    eventId: event.id,
    reference: session.id,
    metadata: readMetadata(session.metadata),
    account: event.account ?? null,
  }
}

// ─── Stripe Connect OAuth ───────────────────────────────────────────────────

/** Where the store is sent to connect its Stripe account. */
export const buildStripeAuthorizeUrl = (input: {
  clientId: string
  redirectUri: string
  state: string
  email?: string | null
}): string =>
  // `oauth.authorizeUrl` builds a URL and makes no request: no key needed.
  new Stripe("sk_unused").oauth.authorizeUrl({
    response_type: "code",
    client_id: input.clientId,
    scope: "read_write",
    redirect_uri: input.redirectUri,
    state: input.state,
    ...(input.email ? { stripe_user: { email: input.email } } : {}),
  })

/**
 * Turns the authorization code into the connection. Stripe revokes the
 * connection when a code is used twice, so the caller must call this at most
 * once per code. The access token Stripe still returns is deprecated and not
 * kept: calls use the platform key with `Stripe-Account` instead.
 */
export const exchangeStripeCode = async (
  input: { platformSecretKey: string; code: string },
  options?: StripeClientOptions,
): Promise<{ accountId: string; livemode: boolean }> => {
  const client = createClient(input.platformSecretKey, options)
  const token = await callStripe(() =>
    client.oauth.token({ grant_type: "authorization_code", code: input.code }),
  )
  if (!token.stripe_user_id || token.livemode === undefined) {
    throw new PaymentProviderError(
      "invalidRequest",
      "Stripe connected the account without its id.",
    )
  }
  return { accountId: token.stripe_user_id, livemode: token.livemode }
}

/** The connected account's name, and whether it can take payments yet. */
export const readStripeAccount = async (
  input: StripeConnectedAccount,
  options?: StripeClientOptions,
): Promise<{ label: string | null; chargesEnabled: boolean }> => {
  const client = createClient(input.platformSecretKey, options)
  const account = await callStripe(() =>
    client.accounts.retrieve(input.accountId),
  )
  return {
    label:
      account.business_profile?.name ??
      account.settings?.dashboard?.display_name ??
      account.email ??
      null,
    chargesEnabled: account.charges_enabled ?? false,
  }
}

/**
 * Disconnects the store's account from the platform. An account that is
 * already disconnected (the store did it from Stripe) counts as done.
 */
export const deauthorizeStripe = async (
  input: StripeConnectedAccount & { clientId: string },
  options?: StripeClientOptions,
): Promise<void> => {
  const client = createClient(input.platformSecretKey, options)
  try {
    await client.oauth.deauthorize({
      client_id: input.clientId,
      stripe_user_id: input.accountId,
    })
  } catch (error) {
    // `invalid_client`: the account is no longer connected to this app.
    if (error instanceof Stripe.errors.StripeInvalidClientError) {
      return
    }
    throw toProviderError(error)
  }
}

/**
 * The platform's Connect webhook (`connect: true`): one endpoint receives the
 * events of every connected store. An endpoint created before is kept when it
 * still exists, so saving the settings again never adds another. One at
 * another URL (the reseller's domain changed) is replaced: the new endpoint
 * is created before the old one is deleted, so no event falls in between.
 */
export const ensureStripeConnectWebhook = async (
  input: {
    platformSecretKey: string
    url: string
    existing?: { endpointId: string; secret: string } | null
  },
  options?: StripeClientOptions,
): Promise<{ endpointId: string; secret: string }> => {
  const client = createClient(input.platformSecretKey, options)
  let replaced: string | null = null
  if (input.existing) {
    try {
      const endpoint = await client.webhookEndpoints.retrieve(
        input.existing.endpointId,
      )
      if (endpoint.url === input.url && endpoint.status === "enabled") {
        return input.existing
      }
      replaced = endpoint.id
    } catch (error) {
      if (
        !(
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.statusCode === 404
        )
      ) {
        throw toProviderError(error)
      }
    }
  }
  const endpoint = await callStripe(() =>
    client.webhookEndpoints.create({
      url: input.url,
      connect: true,
      enabled_events: [...STRIPE_CONNECT_WEBHOOK_EVENTS],
      // Shown in a reseller's own Stripe dashboard: no platform name.
      description: "Web shop payments",
    }),
  )
  if (!endpoint.secret) {
    throw new PaymentProviderError(
      "invalidRequest",
      "Stripe created the webhook without a signing secret.",
    )
  }
  if (replaced) {
    await callStripe(() => client.webhookEndpoints.del(replaced))
  }
  return { endpointId: endpoint.id, secret: endpoint.secret }
}

/** The Stripe account a platform key belongs to (`acct_…`). */
export const readPlatformStripeAccountId = async (
  platformSecretKey: string,
  options?: StripeClientOptions,
): Promise<string> => {
  const client = createClient(platformSecretKey, options)
  const account = await callStripe(() => client.accounts.retrieveCurrent())
  return account.id
}

/** Removes the platform's Connect webhook; one already gone is fine. */
export const deleteStripeConnectWebhook = async (
  input: { platformSecretKey: string; endpointId: string },
  options?: StripeClientOptions,
): Promise<void> => {
  const client = createClient(input.platformSecretKey, options)
  try {
    await client.webhookEndpoints.del(input.endpointId)
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.statusCode === 404
    ) {
      return
    }
    throw toProviderError(error)
  }
}
