import Stripe from "stripe"
import { describe, expect, test } from "vitest"
import { PaymentProviderError } from "../src/errors"
import {
  buildStripeAuthorizeUrl,
  createStripeGateway,
  ensureStripeConnectWebhook,
  exchangeStripeCode,
  parseStripeConnectWebhook,
} from "../src/stripe"

type Call = {
  method: string
  url: URL
  headers: Headers
  body: URLSearchParams
}

type Route = (call: Call) => { status?: number; body: unknown } | undefined

/** A fetch that records Stripe's requests and answers from `route`. */
const fakeStripe = (route: Route) => {
  const calls: Call[] = []
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body: new URLSearchParams(
        typeof init?.body === "string" ? init.body : "",
      ),
    }
    calls.push(call)
    const answer = route(call) ?? {
      status: 404,
      body: { error: { type: "invalid_request_error", message: "nope" } },
    }
    return Promise.resolve(
      Response.json(answer.body, {
        status: answer.status ?? 200,
        headers: { "Request-Id": "req_1" },
      }),
    )
  }) as typeof fetch
  return { calls, fetch: fetchImpl }
}

const ACCOUNT = { platformSecretKey: "sk_test_platform", accountId: "acct_1" }
const METADATA = {
  workspaceId: "10",
  orderId: "20",
  orderPaymentId: "30",
}

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "cs_test_1",
  object: "checkout.session",
  url: "https://checkout.stripe.com/c/pay/cs_test_1",
  status: "open",
  payment_status: "unpaid",
  payment_intent: null,
  amount_total: 1250,
  currency: "usd",
  metadata: METADATA,
  ...overrides,
})

describe("createStripeGateway", () => {
  test("creates one line for exactly the order total, on the store's account", async () => {
    const stripe = fakeStripe((call) =>
      call.method === "POST" && call.url.pathname === "/v1/checkout/sessions"
        ? { body: session() }
        : undefined,
    )
    const gateway = createStripeGateway(ACCOUNT, { fetch: stripe.fetch })

    const created = await gateway.createCheckout({
      amount: 12.5,
      currency: "USD",
      description: "Order #7",
      returnUrl: "https://app.test/return",
      cancelUrl: "https://app.test/cancel",
      expiresAt: new Date("2026-10-25T10:00:00Z"),
      customerEmail: "buyer@example.com",
      metadata: METADATA,
      idempotencyKey: "order-payment-30",
    })

    expect(created).toEqual({
      reference: "cs_test_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
    })
    const [call] = stripe.calls
    expect(call?.headers.get("stripe-account")).toBe("acct_1")
    expect(call?.headers.get("idempotency-key")).toBe("order-payment-30")
    expect(call?.headers.get("authorization")).toBe("Bearer sk_test_platform")
    expect(call?.body.get("mode")).toBe("payment")
    expect(call?.body.get("line_items[0][quantity]")).toBe("1")
    expect(call?.body.get("line_items[0][price_data][unit_amount]")).toBe(
      "1250",
    )
    expect(call?.body.get("line_items[0][price_data][currency]")).toBe("usd")
    expect(call?.body.get("expires_at")).toBe(
      String(Date.parse("2026-10-25T10:00:00Z") / 1000),
    )
    expect(call?.body.get("metadata[orderPaymentId]")).toBe("30")
    expect(call?.body.get("payment_intent_data[metadata][orderId]")).toBe("20")
  })

  test("never sends an amount it would have to round", async () => {
    const stripe = fakeStripe(() => ({ body: session() }))
    const gateway = createStripeGateway(ACCOUNT, { fetch: stripe.fetch })
    await expect(
      gateway.createCheckout({
        amount: 12.345,
        currency: "USD",
        description: "Order #7",
        returnUrl: "https://app.test/return",
        cancelUrl: "https://app.test/cancel",
        expiresAt: new Date(),
        metadata: METADATA,
        idempotencyKey: "k",
      }),
    ).rejects.toMatchObject({ kind: "amountUnsupported" })
    expect(stripe.calls).toHaveLength(0)
  })

  test.each([
    [
      { status: "complete", payment_status: "paid", payment_intent: "pi_1" },
      {
        state: "paid",
        transactionId: "pi_1",
        amountMinor: 1250,
        currency: "USD",
      },
    ],
    [{ status: "open", payment_status: "unpaid" }, { state: "open" }],
    [{ status: "expired", payment_status: "unpaid" }, { state: "closed" }],
    [{ status: "complete", payment_status: "unpaid" }, { state: "processing" }],
  ])("reads a session %o as %o", async (fields, expected) => {
    const stripe = fakeStripe(() => ({ body: session(fields) }))
    const gateway = createStripeGateway(ACCOUNT, { fetch: stripe.fetch })
    await expect(gateway.getCheckoutStatus("cs_test_1")).resolves.toEqual(
      expected,
    )
    expect(stripe.calls[0]?.headers.get("stripe-account")).toBe("acct_1")
  })

  test("a session paid meanwhile cannot be expired, and says it is paid", async () => {
    const stripe = fakeStripe((call) => {
      if (call.url.pathname.endsWith("/expire")) {
        return {
          status: 400,
          body: {
            error: {
              type: "invalid_request_error",
              message: "Only open sessions can be expired.",
            },
          },
        }
      }
      return {
        body: session({
          status: "complete",
          payment_status: "paid",
          payment_intent: "pi_1",
        }),
      }
    })
    const gateway = createStripeGateway(ACCOUNT, { fetch: stripe.fetch })
    await expect(gateway.expireCheckout("cs_test_1")).resolves.toMatchObject({
      state: "paid",
      transactionId: "pi_1",
    })
  })

  test("refunds the whole payment once per key, and treats already refunded as done", async () => {
    const stripe = fakeStripe((call) =>
      call.url.pathname === "/v1/refunds"
        ? { body: { id: "re_1", object: "refund" } }
        : undefined,
    )
    const gateway = createStripeGateway(ACCOUNT, { fetch: stripe.fetch })
    await expect(
      gateway.refund({ transactionId: "pi_1", idempotencyKey: "refund-30" }),
    ).resolves.toEqual({ refundId: "re_1" })
    expect(stripe.calls[0]?.body.get("payment_intent")).toBe("pi_1")
    expect(stripe.calls[0]?.body.has("amount")).toBe(false)
    expect(stripe.calls[0]?.headers.get("idempotency-key")).toBe("refund-30")
    expect(stripe.calls[0]?.headers.get("stripe-account")).toBe("acct_1")

    const refunded = fakeStripe(() => ({
      status: 400,
      body: {
        error: {
          type: "invalid_request_error",
          code: "charge_already_refunded",
          message: "Charge has already been refunded.",
        },
      },
    }))
    await expect(
      createStripeGateway(ACCOUNT, { fetch: refunded.fetch }).refund({
        transactionId: "pi_1",
        idempotencyKey: "refund-30",
      }),
    ).resolves.toEqual({ refundId: null })
  })

  test("reports a rejected key as credentialsRejected", async () => {
    const stripe = fakeStripe(() => ({
      status: 401,
      body: {
        error: { type: "invalid_request_error", message: "Invalid API Key" },
      },
    }))
    await expect(
      createStripeGateway(ACCOUNT, { fetch: stripe.fetch }).getCheckoutStatus(
        "cs_test_1",
      ),
    ).rejects.toMatchObject({ kind: "credentialsRejected" })
  })
})

describe("Stripe Connect OAuth", () => {
  test("builds the authorize link with read_write and the state", () => {
    const url = new URL(
      buildStripeAuthorizeUrl({
        clientId: "ca_123",
        redirectUri: "https://app.test/integrations/stripe/callback",
        state: "s1",
        email: "owner@example.com",
      }),
    )
    expect(url.origin).toBe("https://connect.stripe.com")
    expect(url.pathname).toBe("/oauth/authorize")
    expect(url.searchParams.get("client_id")).toBe("ca_123")
    expect(url.searchParams.get("scope")).toBe("read_write")
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("state")).toBe("s1")
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.test/integrations/stripe/callback",
    )
    expect(url.searchParams.get("stripe_user[email]")).toBe("owner@example.com")
  })

  test("exchanges the code once with the platform key", async () => {
    const stripe = fakeStripe((call) =>
      call.url.host === "connect.stripe.com" &&
      call.url.pathname === "/oauth/token"
        ? {
            body: {
              stripe_user_id: "acct_9",
              livemode: false,
              access_token: "sk_test_deprecated",
              token_type: "bearer",
            },
          }
        : undefined,
    )
    await expect(
      exchangeStripeCode(
        { platformSecretKey: "sk_test_platform", code: "ac_1" },
        { fetch: stripe.fetch },
      ),
    ).resolves.toEqual({ accountId: "acct_9", livemode: false })
    expect(stripe.calls).toHaveLength(1)
    expect(stripe.calls[0]?.body.get("code")).toBe("ac_1")
    expect(stripe.calls[0]?.body.get("grant_type")).toBe("authorization_code")
  })
})

describe("ensureStripeConnectWebhook", () => {
  const endpoint = (id: string, url: string) => ({
    id,
    object: "webhook_endpoint",
    url,
    status: "enabled",
    secret: `whsec_${id}`,
  })

  test("a webhook at another URL is replaced: the new one first, then the old one deleted", async () => {
    const stripe = fakeStripe((call) => {
      if (call.url.pathname === "/v1/webhook_endpoints/we_old") {
        return call.method === "DELETE"
          ? { body: { id: "we_old", deleted: true } }
          : { body: endpoint("we_old", "https://old.example/hook") }
      }
      if (call.url.pathname === "/v1/webhook_endpoints") {
        return { body: endpoint("we_new", "https://new.example/hook") }
      }
      return
    })
    await expect(
      ensureStripeConnectWebhook(
        {
          platformSecretKey: "sk_test_platform",
          url: "https://new.example/hook",
          existing: { endpointId: "we_old", secret: "whsec_we_old" },
        },
        { fetch: stripe.fetch },
      ),
    ).resolves.toEqual({ endpointId: "we_new", secret: "whsec_we_new" })
    expect(stripe.calls.map((call) => call.method)).toEqual([
      "GET",
      "POST",
      "DELETE",
    ])
    expect(stripe.calls[1]?.body.get("description")).toBe("Web shop payments")
    expect(stripe.calls[1]?.body.get("connect")).toBe("true")
  })

  test("a webhook already at the URL is kept", async () => {
    const stripe = fakeStripe((call) =>
      call.url.pathname === "/v1/webhook_endpoints/we_1"
        ? { body: endpoint("we_1", "https://app.example/hook") }
        : undefined,
    )
    const existing = { endpointId: "we_1", secret: "whsec_we_1" }
    await expect(
      ensureStripeConnectWebhook(
        {
          platformSecretKey: "sk_test_platform",
          url: "https://app.example/hook",
          existing,
        },
        { fetch: stripe.fetch },
      ),
    ).resolves.toBe(existing)
    expect(stripe.calls).toHaveLength(1)
  })
})

describe("parseStripeConnectWebhook", () => {
  const secret = "whsec_test"
  const signed = async (payload: unknown) => {
    const rawBody = JSON.stringify(payload)
    const header = await Stripe.webhooks.generateTestHeaderStringAsync({
      payload: rawBody,
      secret,
    })
    return { rawBody, headers: new Headers({ "stripe-signature": header }) }
  }

  test("reads a checkout event with the account and metadata", async () => {
    const request = await signed({
      id: "evt_1",
      object: "event",
      type: "checkout.session.completed",
      account: "acct_1",
      data: { object: session({ status: "complete" }) },
    })
    await expect(
      parseStripeConnectWebhook({
        ...request,
        platformSecretKey: "sk_test_platform",
        webhookSecret: secret,
      }),
    ).resolves.toEqual({
      kind: "checkout",
      eventId: "evt_1",
      reference: "cs_test_1",
      metadata: METADATA,
      account: "acct_1",
    })
  })

  test("reads a deauthorization", async () => {
    const request = await signed({
      id: "evt_2",
      object: "event",
      type: "account.application.deauthorized",
      account: "acct_1",
      created: 1_790_000_000,
      data: { object: { id: "ca_123", object: "application" } },
    })
    await expect(
      parseStripeConnectWebhook({
        ...request,
        platformSecretKey: "sk_test_platform",
        webhookSecret: secret,
      }),
    ).resolves.toEqual({
      kind: "deauthorized",
      eventId: "evt_2",
      account: "acct_1",
      createdAt: new Date(1_790_000_000 * 1000),
    })
  })

  test("refuses a forged or tampered body", async () => {
    const request = await signed({
      id: "evt_1",
      object: "event",
      type: "checkout.session.completed",
      data: { object: session() },
    })
    await expect(
      parseStripeConnectWebhook({
        rawBody: request.rawBody.replace("cs_test_1", "cs_test_2"),
        headers: request.headers,
        platformSecretKey: "sk_test_platform",
        webhookSecret: secret,
      }),
    ).rejects.toMatchObject({ kind: "signatureInvalid" })
    await expect(
      parseStripeConnectWebhook({
        rawBody: request.rawBody,
        headers: new Headers(),
        platformSecretKey: "sk_test_platform",
        webhookSecret: secret,
      }),
    ).rejects.toBeInstanceOf(PaymentProviderError)
  })
})
