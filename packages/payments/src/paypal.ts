import { PaymentProviderError, type PaymentProviderErrorKind } from "./errors"
import {
  formatPaypalValue,
  parsePaypalValue,
  toPaypalMinorUnits,
} from "./minor-units"
import type {
  CheckoutStatus,
  CreateCheckoutInput,
  CreatedCheckout,
  PaymentGateway,
  PaymentMetadata,
  PaymentWebhookEvent,
  PaymentWebhookRequest,
  PaypalSecret,
  RefundResult,
} from "./types"

const PAYPAL_HOSTS = {
  live: "https://api-m.paypal.com",
  sandbox: "https://api-m.sandbox.paypal.com",
} as const

/** The events the webhook created on connect listens to. */
export const PAYPAL_WEBHOOK_EVENTS = [
  "CHECKOUT.ORDER.APPROVED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.PENDING",
] as const

const REQUEST_TIMEOUT_MS = 20_000
/** A token is renewed this long before PayPal says it expires. */
const TOKEN_REFRESH_MARGIN_MS = 60_000

export type PaypalClientOptions = {
  /** Tests answer PayPal's HTTP calls with this. */
  fetch?: typeof fetch
}

type PaypalCredentials = {
  clientId: string
  clientSecret: string
  livemode: boolean
}

type PaypalErrorBody = {
  name?: string
  message?: string
  error?: string
  error_description?: string
  details?: Array<{ issue?: string; description?: string }>
}

type PaypalAmount = { currency_code: string; value: string }

type PaypalCapture = {
  id: string
  status: string
  amount?: PaypalAmount
  custom_id?: string
  supplementary_data?: { related_ids?: { order_id?: string } }
}

type PaypalOrder = {
  id: string
  status: string
  links?: Array<{ href: string; rel: string }>
  purchase_units?: Array<{
    custom_id?: string
    payments?: { captures?: PaypalCapture[] }
  }>
}

/** `workspaceId:orderId:orderPaymentId`, PayPal's `custom_id`. */
const encodeCustomId = (metadata: PaymentMetadata) =>
  `${metadata.workspaceId}:${metadata.orderId}:${metadata.orderPaymentId}`

const CUSTOM_ID_PATTERN = /^(\d+):(\d+):(\d+)$/

const decodeCustomId = (
  customId: string | undefined,
): PaymentMetadata | null => {
  const match = customId ? CUSTOM_ID_PATTERN.exec(customId) : null
  return match?.[1] && match[2] && match[3]
    ? { workspaceId: match[1], orderId: match[2], orderPaymentId: match[3] }
    : null
}

const errorKindForStatus = (status: number): PaymentProviderErrorKind => {
  if (status === 401 || status === 403) {
    return "credentialsRejected"
  }
  if (status >= 500 || status === 429) {
    return "unavailable"
  }
  return "invalidRequest"
}

class PaypalHttpError extends PaymentProviderError {
  readonly status: number
  readonly body: PaypalErrorBody

  constructor(status: number, body: PaypalErrorBody) {
    const issue = body.details?.[0]?.issue ?? body.name ?? body.error ?? null
    super(
      errorKindForStatus(status),
      body.details?.[0]?.description ??
        body.message ??
        body.error_description ??
        `PayPal answered ${status}.`,
      { providerCode: issue },
    )
    this.status = status
    this.body = body
  }

  hasIssue(issue: string): boolean {
    return (
      this.body.name === issue ||
      (this.body.details ?? []).some((detail) => detail.issue === issue)
    )
  }
}

/** A REST client for one store's PayPal app, live or sandbox. */
const createClient = (
  credentials: PaypalCredentials,
  options?: PaypalClientOptions,
) => {
  const fetchImpl = options?.fetch ?? fetch
  const base = credentials.livemode ? PAYPAL_HOSTS.live : PAYPAL_HOSTS.sandbox
  let token: { value: string; expiresAt: number } | null = null

  const send = async (
    path: string,
    init: RequestInit & { headers: Record<string, string> },
  ): Promise<Response> => {
    try {
      return await fetchImpl(`${base}${path}`, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      throw new PaymentProviderError("unavailable", "PayPal did not answer.", {
        cause: error,
      })
    }
  }

  const readError = async (response: Response) => {
    let body: PaypalErrorBody = {}
    try {
      body = (await response.json()) as PaypalErrorBody
    } catch {
      // A body that is not JSON still gets its status reported.
    }
    return new PaypalHttpError(response.status, body)
  }

  const getToken = async (): Promise<string> => {
    if (token && token.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) {
      return token.value
    }
    const basic = Buffer.from(
      `${credentials.clientId}:${credentials.clientSecret}`,
    ).toString("base64")
    const response = await send("/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    })
    if (!response.ok) {
      const error = await readError(response)
      // A wrong id or secret is 401 `invalid_client`.
      if (response.status === 400 || response.status === 401) {
        throw new PaymentProviderError(
          "credentialsRejected",
          "PayPal refused the Client ID or Secret.",
          { providerCode: error.providerCode, cause: error },
        )
      }
      throw error
    }
    const body = (await response.json()) as {
      access_token: string
      expires_in: number
    }
    token = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    }
    return token.value
  }

  const request = async <T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    input?: { body?: unknown; rawBody?: string; requestId?: string },
  ): Promise<T> => {
    const body =
      input?.rawBody ??
      (input?.body === undefined ? undefined : JSON.stringify(input.body))
    const response = await send(path, {
      method,
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(input?.requestId ? { "PayPal-Request-Id": input.requestId } : {}),
      },
      ...(body === undefined ? {} : { body }),
    })
    if (!response.ok) {
      throw await readError(response)
    }
    if (response.status === 204) {
      return undefined as T
    }
    return (await response.json()) as T
  }

  return { getToken, request }
}

const findCapture = (order: PaypalOrder): PaypalCapture | undefined =>
  order.purchase_units?.[0]?.payments?.captures?.[0]

/** Where a PayPal order stands, from the order and its capture. */
const toCheckoutStatus = (order: PaypalOrder): CheckoutStatus => {
  if (order.status === "COMPLETED") {
    const capture = findCapture(order)
    switch (capture?.status) {
      case "COMPLETED": {
        if (!capture.amount) {
          throw new PaymentProviderError(
            "invalidRequest",
            `PayPal captured order ${order.id} without its amount.`,
          )
        }
        const currency = capture.amount.currency_code.toUpperCase()
        return {
          state: "paid",
          transactionId: capture.id,
          amountMinor: parsePaypalValue(capture.amount.value, currency),
          currency,
        }
      }
      // Taken from the customer, not yet credited to the store.
      case "PENDING":
        return { state: "processing" }
      default:
        // Declined, failed, or refunded from the PayPal side.
        return { state: "closed" }
    }
  }
  if (order.status === "VOIDED") {
    return { state: "closed" }
  }
  // CREATED, SAVED, PAYER_ACTION_REQUIRED, or APPROVED but not captured.
  return { state: "open" }
}

/** One store's PayPal account, for its web shop. */
export const createPaypalGateway = (
  secret: PaypalSecret,
  options?: PaypalClientOptions,
): PaymentGateway => {
  const client = createClient(secret, options)

  const getOrder = (reference: string) =>
    client.request<PaypalOrder>(
      "GET",
      `/v2/checkout/orders/${encodeURIComponent(reference)}`,
    )

  return {
    provider: "paypal",

    toMinorUnits: toPaypalMinorUnits,

    async createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout> {
      const minor = toPaypalMinorUnits(input.amount, input.currency)
      const order = await client.request<PaypalOrder>(
        "POST",
        "/v2/checkout/orders",
        {
          requestId: input.idempotencyKey,
          body: {
            intent: "CAPTURE",
            purchase_units: [
              {
                reference_id: input.metadata.orderPaymentId,
                custom_id: encodeCustomId(input.metadata),
                description: input.description.slice(0, 127),
                amount: {
                  currency_code: input.currency.toUpperCase(),
                  value: formatPaypalValue(minor, input.currency),
                },
              },
            ],
            payment_source: {
              paypal: {
                experience_context: {
                  return_url: input.returnUrl,
                  cancel_url: input.cancelUrl,
                  user_action: "PAY_NOW",
                  shipping_preference: "NO_SHIPPING",
                },
              },
            },
          },
        },
      )
      const url = order.links?.find((link) => link.rel === "payer-action")?.href
      if (!url) {
        throw new PaymentProviderError(
          "invalidRequest",
          `PayPal created order ${order.id} without a page to pay on.`,
        )
      }
      return { reference: order.id, url }
    },

    async getCheckoutStatus(reference, statusOptions): Promise<CheckoutStatus> {
      const order = await getOrder(reference)
      if (order.status !== "APPROVED" || !statusOptions?.capture) {
        return toCheckoutStatus(order)
      }
      try {
        return toCheckoutStatus(
          await client.request<PaypalOrder>(
            "POST",
            `/v2/checkout/orders/${encodeURIComponent(reference)}/capture`,
            { requestId: statusOptions.capture.idempotencyKey, body: {} },
          ),
        )
      } catch (error) {
        // Captured meanwhile, or the customer's card was declined (they can
        // pick another on the same page): the order itself says which.
        if (error instanceof PaypalHttpError && error.status === 422) {
          return toCheckoutStatus(await getOrder(reference))
        }
        throw error
      }
    },

    // A PayPal order is never charged unless ChatbotX captures it, and an
    // expired order is never captured: there is nothing to close.
    async expireCheckout(reference): Promise<CheckoutStatus> {
      const status = toCheckoutStatus(await getOrder(reference))
      return status.state === "open" ? { state: "closed" } : status
    },

    async refund(input): Promise<RefundResult> {
      try {
        const refund = await client.request<{ id: string }>(
          "POST",
          `/v2/payments/captures/${encodeURIComponent(input.transactionId)}/refund`,
          { requestId: input.idempotencyKey, body: {} },
        )
        return { refundId: refund.id }
      } catch (error) {
        if (
          error instanceof PaypalHttpError &&
          error.hasIssue("CAPTURE_FULLY_REFUNDED")
        ) {
          return { refundId: null }
        }
        throw error
      }
    },
  }
}

const SIGNATURE_HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const

type PaypalWebhookEvent = {
  id: string
  event_type: string
  resource?: PaypalOrder & PaypalCapture
}

/**
 * Asks PayPal whether it signed this webhook (it checks the signature against
 * the webhook created on connect), then reduces it to the order it is about.
 */
export const parsePaypalWebhook = async (
  input: PaymentWebhookRequest & { secret: PaypalSecret },
  options?: PaypalClientOptions,
): Promise<PaymentWebhookEvent> => {
  const signature = Object.fromEntries(
    Object.entries(SIGNATURE_HEADERS).map(([field, header]) => [
      field,
      input.headers.get(header),
    ]),
  )
  if (Object.values(signature).some((value) => !value)) {
    throw new PaymentProviderError(
      "signatureInvalid",
      "The PayPal signature headers are missing.",
    )
  }
  let event: PaypalWebhookEvent
  try {
    event = JSON.parse(input.rawBody) as PaypalWebhookEvent
  } catch {
    throw new PaymentProviderError(
      "signatureInvalid",
      "The webhook body is not JSON.",
    )
  }
  // PayPal checks its signature against the event bytes it sent, so the body
  // goes back verbatim: re-serializing it can change numbers or escapes and
  // fail the check.
  const fields = JSON.stringify({
    ...signature,
    webhook_id: input.secret.webhookId,
  })
  const client = createClient(input.secret, options)
  const verification = await client.request<{ verification_status: string }>(
    "POST",
    "/v1/notifications/verify-webhook-signature",
    { rawBody: `${fields.slice(0, -1)},"webhook_event":${input.rawBody}}` },
  )
  if (verification.verification_status !== "SUCCESS") {
    throw new PaymentProviderError(
      "signatureInvalid",
      "PayPal did not sign this webhook.",
    )
  }

  const resource = event.resource
  if (event.event_type === "CHECKOUT.ORDER.APPROVED" && resource?.id) {
    return {
      kind: "checkout",
      eventId: event.id,
      reference: resource.id,
      metadata: decodeCustomId(resource.purchase_units?.[0]?.custom_id),
      account: null,
    }
  }
  const orderId = resource?.supplementary_data?.related_ids?.order_id
  if (event.event_type.startsWith("PAYMENT.CAPTURE.") && orderId) {
    return {
      kind: "checkout",
      eventId: event.id,
      reference: orderId,
      metadata: decodeCustomId(resource?.custom_id),
      account: null,
    }
  }
  return { kind: "ignored", eventId: event.id }
}

const isCredentialsRejected = (error: unknown) =>
  error instanceof PaymentProviderError && error.kind === "credentialsRejected"

/**
 * Checks a store's Client ID and Secret — live first, then sandbox, so the
 * store never has to say which — and creates the webhook PayPal calls the
 * store's ChatbotX back on. Returns what is stored for the store.
 */
export const connectPaypal = async (
  input: { clientId: string; clientSecret: string; webhookUrl: string },
  options?: PaypalClientOptions,
): Promise<{ livemode: boolean; secret: PaypalSecret }> => {
  const keys = {
    clientId: input.clientId.trim(),
    clientSecret: input.clientSecret.trim(),
  }
  let livemode = true
  let client = createClient({ ...keys, livemode }, options)
  try {
    await client.getToken()
  } catch (error) {
    if (!isCredentialsRejected(error)) {
      throw error
    }
    livemode = false
    client = createClient({ ...keys, livemode }, options)
    await client.getToken()
  }
  const webhookId = await createOrReuseWebhook(client, input.webhookUrl)
  return { livemode, secret: { ...keys, livemode, webhookId } }
}

const createOrReuseWebhook = async (
  client: ReturnType<typeof createClient>,
  url: string,
): Promise<string> => {
  try {
    const webhook = await client.request<{ id: string }>(
      "POST",
      "/v1/notifications/webhooks",
      {
        body: {
          url,
          event_types: PAYPAL_WEBHOOK_EVENTS.map((name) => ({ name })),
        },
      },
    )
    return webhook.id
  } catch (error) {
    if (
      !(
        error instanceof PaypalHttpError &&
        error.hasIssue("WEBHOOK_URL_ALREADY_EXISTS")
      )
    ) {
      throw error
    }
    // Connected before with the same app: reuse that webhook.
    const list = await client.request<{
      webhooks?: Array<{ id: string; url: string }>
    }>("GET", "/v1/notifications/webhooks")
    const existing = list.webhooks?.find((webhook) => webhook.url === url)
    if (!existing) {
      throw error
    }
    return existing.id
  }
}

/** Removes the webhook created on connect; one already gone is fine. */
export const disconnectPaypal = async (
  secret: PaypalSecret,
  options?: PaypalClientOptions,
): Promise<void> => {
  const client = createClient(secret, options)
  try {
    await client.request(
      "DELETE",
      `/v1/notifications/webhooks/${encodeURIComponent(secret.webhookId)}`,
    )
  } catch (error) {
    if (error instanceof PaypalHttpError && error.status === 404) {
      return
    }
    throw error
  }
}
