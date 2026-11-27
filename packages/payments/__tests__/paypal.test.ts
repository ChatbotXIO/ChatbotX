import { describe, expect, test } from "vitest"
import {
  connectPaypal,
  createPaypalGateway,
  parsePaypalWebhook,
} from "../src/paypal"
import type { PaypalSecret } from "../src/types"

type Call = {
  method: string
  url: URL
  headers: Headers
  body: unknown
  raw: string
}

type Route = (call: Call) => { status?: number; body?: unknown } | undefined

const fakePaypal = (route: Route) => {
  const calls: Call[] = []
  const answer = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof init?.body === "string" ? init.body : ""
    let body: unknown = raw
    try {
      body = raw ? JSON.parse(raw) : undefined
    } catch {
      // the token request is form encoded
    }
    const call: Call = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: new Headers(init?.headers),
      body,
      raw,
    }
    calls.push(call)
    const routed = route(call)
    if (call.url.pathname === "/v1/oauth2/token" && !routed) {
      return Response.json({ access_token: "token", expires_in: 3600 })
    }
    const reply = routed ?? { status: 404, body: { name: "NOT_FOUND" } }
    return reply.status === 204
      ? new Response(null, { status: 204 })
      : Response.json(reply.body ?? {}, { status: reply.status ?? 200 })
  }
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(answer(input, init))) as typeof fetch
  return { calls, fetch: fetchImpl }
}

const SECRET: PaypalSecret = {
  clientId: "client",
  clientSecret: "secret",
  livemode: false,
  webhookId: "WH-1",
}

const METADATA = { workspaceId: "10", orderId: "20", orderPaymentId: "30" }

const completedOrder = (captureStatus = "COMPLETED") => ({
  id: "ORDER-1",
  status: "COMPLETED",
  purchase_units: [
    {
      custom_id: "10:20:30",
      payments: {
        captures: [
          {
            id: "CAPTURE-1",
            status: captureStatus,
            amount: { currency_code: "USD", value: "12.50" },
          },
        ],
      },
    },
  ],
})

describe("createPaypalGateway", () => {
  test("creates a CAPTURE order for exactly the total and sends the customer to payer-action", async () => {
    const paypal = fakePaypal((call) =>
      call.method === "POST" && call.url.pathname === "/v2/checkout/orders"
        ? {
            body: {
              id: "ORDER-1",
              status: "PAYER_ACTION_REQUIRED",
              links: [
                {
                  rel: "payer-action",
                  href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1",
                },
              ],
            },
          }
        : undefined,
    )
    const gateway = createPaypalGateway(SECRET, { fetch: paypal.fetch })
    await expect(
      gateway.createCheckout({
        amount: 12.5,
        currency: "USD",
        description: "Order #7",
        returnUrl: "https://app.test/return",
        cancelUrl: "https://app.test/cancel",
        expiresAt: new Date(),
        metadata: METADATA,
        idempotencyKey: "order-payment-30",
      }),
    ).resolves.toEqual({
      reference: "ORDER-1",
      url: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1",
    })
    const create = paypal.calls.find(
      (call) => call.url.pathname === "/v2/checkout/orders",
    )
    expect(create?.url.origin).toBe("https://api-m.sandbox.paypal.com")
    expect(create?.headers.get("paypal-request-id")).toBe("order-payment-30")
    expect(create?.body).toMatchObject({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: "10:20:30",
          amount: { currency_code: "USD", value: "12.50" },
        },
      ],
    })
  })

  test("refuses a currency PayPal does not take, before calling PayPal", async () => {
    const paypal = fakePaypal(() => undefined)
    const gateway = createPaypalGateway(SECRET, { fetch: paypal.fetch })
    await expect(
      gateway.createCheckout({
        amount: 150_000,
        currency: "VND",
        description: "Order #7",
        returnUrl: "https://app.test/return",
        cancelUrl: "https://app.test/cancel",
        expiresAt: new Date(),
        metadata: METADATA,
        idempotencyKey: "k",
      }),
    ).rejects.toMatchObject({ kind: "amountUnsupported" })
    expect(paypal.calls).toHaveLength(0)
  })

  test("captures an approved order only when asked, with its own request id", async () => {
    const paypal = fakePaypal((call) => {
      if (call.method === "GET") {
        return { body: { id: "ORDER-1", status: "APPROVED" } }
      }
      if (call.url.pathname.endsWith("/capture")) {
        return { status: 201, body: completedOrder() }
      }
      return
    })
    const gateway = createPaypalGateway(SECRET, { fetch: paypal.fetch })

    await expect(gateway.getCheckoutStatus("ORDER-1")).resolves.toEqual({
      state: "open",
    })
    expect(
      paypal.calls.some((call) => call.url.pathname.endsWith("/capture")),
    ).toBe(false)

    await expect(
      gateway.getCheckoutStatus("ORDER-1", {
        capture: { idempotencyKey: "capture-30" },
      }),
    ).resolves.toEqual({
      state: "paid",
      transactionId: "CAPTURE-1",
      amountMinor: 1250,
      currency: "USD",
    })
    const capture = paypal.calls.find((call) =>
      call.url.pathname.endsWith("/capture"),
    )
    expect(capture?.headers.get("paypal-request-id")).toBe("capture-30")
  })

  test("a refused capture reads the order again instead of guessing", async () => {
    let reads = 0
    const paypal = fakePaypal((call) => {
      if (call.method === "GET") {
        reads += 1
        return {
          body:
            reads === 1
              ? { id: "ORDER-1", status: "APPROVED" }
              : completedOrder(),
        }
      }
      if (call.url.pathname.endsWith("/capture")) {
        return {
          status: 422,
          body: {
            name: "UNPROCESSABLE_ENTITY",
            details: [{ issue: "ORDER_ALREADY_CAPTURED" }],
          },
        }
      }
      return
    })
    const gateway = createPaypalGateway(SECRET, { fetch: paypal.fetch })
    await expect(
      gateway.getCheckoutStatus("ORDER-1", {
        capture: { idempotencyKey: "capture-30" },
      }),
    ).resolves.toMatchObject({ state: "paid", transactionId: "CAPTURE-1" })
  })

  test.each([
    ["PENDING", { state: "processing" }],
    ["DECLINED", { state: "closed" }],
    ["REFUNDED", { state: "closed" }],
  ])("a capture %s reads as %o", async (status, expected) => {
    const paypal = fakePaypal(() => ({ body: completedOrder(status) }))
    const gateway = createPaypalGateway(SECRET, { fetch: paypal.fetch })
    await expect(gateway.getCheckoutStatus("ORDER-1")).resolves.toEqual(
      expected,
    )
  })

  test("an expired order is never captured afterwards: open reads as closed", async () => {
    const paypal = fakePaypal(() => ({
      body: { id: "ORDER-1", status: "APPROVED" },
    }))
    const gateway = createPaypalGateway(SECRET, { fetch: paypal.fetch })
    await expect(gateway.expireCheckout("ORDER-1")).resolves.toEqual({
      state: "closed",
    })
    expect(
      paypal.calls.every(
        (call) =>
          call.method !== "POST" || call.url.pathname === "/v1/oauth2/token",
      ),
    ).toBe(true)
  })

  test("refunds a capture, and treats an already refunded one as done", async () => {
    const paypal = fakePaypal((call) =>
      call.url.pathname === "/v2/payments/captures/CAPTURE-1/refund"
        ? { status: 201, body: { id: "REFUND-1", status: "COMPLETED" } }
        : undefined,
    )
    await expect(
      createPaypalGateway(SECRET, { fetch: paypal.fetch }).refund({
        transactionId: "CAPTURE-1",
        idempotencyKey: "refund-30",
      }),
    ).resolves.toEqual({ refundId: "REFUND-1" })

    const refunded = fakePaypal(() => ({
      status: 422,
      body: {
        name: "UNPROCESSABLE_ENTITY",
        details: [{ issue: "CAPTURE_FULLY_REFUNDED" }],
      },
    }))
    await expect(
      createPaypalGateway(SECRET, { fetch: refunded.fetch }).refund({
        transactionId: "CAPTURE-1",
        idempotencyKey: "refund-30",
      }),
    ).resolves.toEqual({ refundId: null })
  })
})

describe("connectPaypal", () => {
  test("tries live first, then sandbox, and creates the webhook", async () => {
    const paypal = fakePaypal((call) => {
      if (call.url.pathname === "/v1/oauth2/token") {
        return call.url.host === "api-m.paypal.com"
          ? { status: 401, body: { error: "invalid_client" } }
          : undefined
      }
      if (call.url.pathname === "/v1/notifications/webhooks") {
        return { status: 201, body: { id: "WH-9" } }
      }
      return
    })
    await expect(
      connectPaypal(
        {
          clientId: " client ",
          clientSecret: "secret",
          webhookUrl: "https://app.test/api/payments/paypal/10/webhook",
        },
        { fetch: paypal.fetch },
      ),
    ).resolves.toEqual({
      livemode: false,
      secret: {
        clientId: "client",
        clientSecret: "secret",
        livemode: false,
        webhookId: "WH-9",
      },
    })
    const webhook = paypal.calls.find(
      (call) => call.url.pathname === "/v1/notifications/webhooks",
    )
    expect(webhook?.url.host).toBe("api-m.sandbox.paypal.com")
  })

  test("wrong keys on both are credentialsRejected", async () => {
    const paypal = fakePaypal((call) =>
      call.url.pathname === "/v1/oauth2/token"
        ? { status: 401, body: { error: "invalid_client" } }
        : undefined,
    )
    await expect(
      connectPaypal(
        { clientId: "x", clientSecret: "y", webhookUrl: "https://app.test/w" },
        { fetch: paypal.fetch },
      ),
    ).rejects.toMatchObject({ kind: "credentialsRejected" })
  })

  test("reuses the webhook a previous connection created", async () => {
    const url = "https://app.test/api/payments/paypal/10/webhook"
    const paypal = fakePaypal((call) => {
      if (call.url.pathname !== "/v1/notifications/webhooks") {
        return
      }
      return call.method === "POST"
        ? { status: 400, body: { name: "WEBHOOK_URL_ALREADY_EXISTS" } }
        : { body: { webhooks: [{ id: "WH-OLD", url }] } }
    })
    await expect(
      connectPaypal(
        { clientId: "c", clientSecret: "s", webhookUrl: url },
        { fetch: paypal.fetch },
      ),
    ).resolves.toMatchObject({ secret: { webhookId: "WH-OLD" } })
  })
})

describe("parsePaypalWebhook", () => {
  const headers = new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
    "paypal-transmission-id": "t1",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-10-25T00:00:00Z",
  })

  const verifying = (status: string) =>
    fakePaypal((call) =>
      call.url.pathname === "/v1/notifications/verify-webhook-signature"
        ? { body: { verification_status: status } }
        : undefined,
    )

  test("asks PayPal to verify against the store's webhook, then reads a capture", async () => {
    const paypal = verifying("SUCCESS")
    const event = {
      id: "WH-EVT-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAPTURE-1",
        status: "COMPLETED",
        custom_id: "10:20:30",
        supplementary_data: { related_ids: { order_id: "ORDER-1" } },
      },
    }
    await expect(
      parsePaypalWebhook(
        { rawBody: JSON.stringify(event), headers, secret: SECRET },
        { fetch: paypal.fetch },
      ),
    ).resolves.toEqual({
      kind: "checkout",
      eventId: "WH-EVT-1",
      reference: "ORDER-1",
      metadata: METADATA,
      account: null,
    })
    const verify = paypal.calls.find((call) =>
      call.url.pathname.endsWith("verify-webhook-signature"),
    )
    expect(verify?.body).toMatchObject({
      webhook_id: "WH-1",
      transmission_id: "t1",
      webhook_event: event,
    })
  })

  test("sends the event back byte for byte, not re-serialized", async () => {
    const paypal = verifying("SUCCESS")
    // `1.0` and `é` would both change if the body went through JSON.parse
    // and JSON.stringify, breaking PayPal's signature check.
    const rawBody =
      '{"id":"WH-EVT-2", "event_type":"CHECKOUT.ORDER.APPROVED","resource":{"id":"ORDER-2","amount":1.0,"note":"caf\\u00e9"}}'
    await parsePaypalWebhook(
      { rawBody, headers, secret: SECRET },
      { fetch: paypal.fetch },
    )
    const verify = paypal.calls.find((call) =>
      call.url.pathname.endsWith("verify-webhook-signature"),
    )
    expect(verify?.raw.endsWith(`,"webhook_event":${rawBody}}`)).toBe(true)
  })

  test("refuses an event PayPal did not sign, or without its headers", async () => {
    const rawBody = JSON.stringify({
      id: "x",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
    })
    await expect(
      parsePaypalWebhook(
        { rawBody, headers, secret: SECRET },
        { fetch: verifying("FAILURE").fetch },
      ),
    ).rejects.toMatchObject({ kind: "signatureInvalid" })
    await expect(
      parsePaypalWebhook(
        { rawBody, headers: new Headers(), secret: SECRET },
        { fetch: verifying("SUCCESS").fetch },
      ),
    ).rejects.toMatchObject({ kind: "signatureInvalid" })
  })
})
