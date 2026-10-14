// @vitest-environment node
import type { NextRequest } from "next/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByToken: vi.fn(),
  recordRequest: vi.fn(),
  enqueue: vi.fn(),
  checkApiRateLimit: vi.fn(),
  getGuestClientIp: vi.fn(),
  resolveFreezeReason: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  resolveWorkspaceFreezeReasonById: mocks.resolveFreezeReason,
  inboundWebhookService: {
    findByToken: mocks.findByToken,
    recordRequest: mocks.recordRequest,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueProcessInboundWebhookRequest: mocks.enqueue,
}))
vi.mock("@/lib/rate-limit/api-rate-limit", () => ({
  checkApiRateLimit: mocks.checkApiRateLimit,
}))
vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  getGuestClientIp: mocks.getGuestClientIp,
  UNKNOWN_CLIENT_IP: "unknown",
}))
vi.mock("@/lib/log", () => ({
  logger: { warn: mocks.loggerWarn, error: mocks.loggerError },
}))

const { DrizzleQueryError } = await import("@chatbotx.io/database/client")
const route = await import("../src/app/api/hooks/[token]/route")

const UPPER_SNAKE_CASE = /^[A-Z]+(_[A-Z]+)*$/
const TOKEN = `iwh_${"a".repeat(43)}`
const WEBHOOK = {
  id: "w-1",
  workspaceId: "ws-1",
  active: true,
  isConfigured: true,
}
const URL_FOR = (token = TOKEN) => `https://app.test/api/hooks/${token}`

const post = (
  body: string | null = '{"a":1}',
  headers: Record<string, string> = {},
  token = TOKEN,
) =>
  route.POST(
    new Request(URL_FOR(token), {
      method: "POST",
      body,
      headers: { "content-type": "application/json", ...headers },
    }) as unknown as NextRequest,
    { params: Promise.resolve({ token }) },
  )

const json = async (response: Response) => await response.json()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getGuestClientIp.mockReturnValue("1.2.3.4")
  mocks.checkApiRateLimit.mockResolvedValue({ limited: false, retryAfter: 4 })
  mocks.findByToken.mockResolvedValue(WEBHOOK)
  mocks.resolveFreezeReason.mockResolvedValue({ freezeReason: null })
  mocks.recordRequest.mockResolvedValue({
    duplicate: false,
    request: { id: "r-1" },
  })
  mocks.enqueue.mockResolvedValue(undefined)
})

describe("accepting a delivery", () => {
  test("stores the request, enqueues it and answers 202 with its id", async () => {
    const response = await post()

    expect(response.status).toBe(202)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await json(response)).toEqual({ accepted: true, requestId: "r-1" })
    expect(mocks.recordRequest).toHaveBeenCalledWith({
      webhook: WEBHOOK,
      payload: { a: 1 },
      idempotencyKey: null,
      clientInfo: { clientIp: "1.2.3.4", userAgent: null },
    })
    expect(mocks.enqueue).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboundWebhookId: "w-1",
      requestId: "r-1",
    })
  })

  test("keeps the caller's IP and user agent with the request, truncating the agent", async () => {
    await post('{"a":1}', { "user-agent": "x".repeat(2000) })

    expect(mocks.recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientInfo: { clientIp: "1.2.3.4", userAgent: "x".repeat(512) },
      }),
    )
  })

  test.each([
    ["not-an-ip"],
    ["1.2.3.4; drop table"],
    ["x".repeat(500)],
  ])("never stores a forwarded value that is not an IP address (%s)", async (forwarded) => {
    mocks.getGuestClientIp.mockReturnValue(forwarded)

    await post('{"a":1}', { "user-agent": "curl/8" })

    expect(mocks.recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientInfo: { clientIp: null, userAgent: "curl/8" },
      }),
    )
  })

  test("keeps an IPv6 address", async () => {
    mocks.getGuestClientIp.mockReturnValue("2001:db8::1")

    await post()

    expect(mocks.recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientInfo: { clientIp: "2001:db8::1", userAgent: null },
      }),
    )
  })

  test("stores an unknown IP as null rather than the placeholder", async () => {
    mocks.getGuestClientIp.mockReturnValue("unknown")

    await post('{"a":1}', { "user-agent": "curl/8" })

    expect(mocks.recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientInfo: { clientIp: null, userAgent: "curl/8" },
      }),
    )
  })

  test("accepts nesting at the limit", async () => {
    expect((await post(`${"[".repeat(64)}${"]".repeat(64)}`)).status).toBe(202)
  })

  test("accepts accented and emoji text", async () => {
    expect((await post('{"name":"Nguyễn 😀"}')).status).toBe(202)
  })

  test("accepts a JSON array body", async () => {
    expect((await post("[1,2]")).status).toBe(202)
  })

  test("passes the Idempotency-Key through", async () => {
    await post('{"a":1}', { "Idempotency-Key": " key-1 " })

    expect(mocks.recordRequest).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "key-1" }),
    )
  })

  test("a duplicate answers 200 and enqueues nothing", async () => {
    mocks.recordRequest.mockResolvedValue({ duplicate: true })

    const response = await post()

    expect(response.status).toBe(200)
    expect(await json(response)).toEqual({ accepted: true, duplicate: true })
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("an enqueue failure still answers 202: the stored request is swept by the cron", async () => {
    mocks.enqueue.mockRejectedValue(new Error("redis down"))

    const response = await post()

    expect(response.status).toBe(202)
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })
})

describe("rejecting a delivery", () => {
  test.each([
    ["too short", "iwh_abc"],
    ["wrong prefix", `cbx_api_${"a".repeat(43)}`],
    ["bad characters", `iwh_${"a".repeat(40)}!!!`],
  ])("a token that is %s is 404 without any lookup", async (_name, token) => {
    const response = await post('{"a":1}', {}, token)

    expect(response.status).toBe(404)
    expect((await json(response)).code).toBe("NOT_FOUND")
    expect(mocks.findByToken).not.toHaveBeenCalled()
    expect(mocks.checkApiRateLimit).not.toHaveBeenCalled()
  })

  test("an unknown token is 404", async () => {
    mocks.findByToken.mockResolvedValue(null)

    const response = await post()

    expect(response.status).toBe(404)
    expect((await json(response)).code).toBe("NOT_FOUND")
    expect(mocks.recordRequest).not.toHaveBeenCalled()
  })

  test.each([
    "scheduledForDeletion",
    "missingWorkspace",
  ])("a workspace that is %s is 410", async (freezeReason) => {
    mocks.resolveFreezeReason.mockResolvedValue({ freezeReason })

    const response = await post()

    expect(response.status).toBe(410)
    expect((await json(response)).code).toBe("WORKSPACE_UNAVAILABLE")
    expect(mocks.recordRequest).not.toHaveBeenCalled()
  })

  test("a blocked owner's webhook is refused, so no unprocessable request piles up", async () => {
    mocks.resolveFreezeReason.mockResolvedValue({
      freezeReason: "ownerBlocked",
    })

    const response = await post()

    expect(response.status).toBe(403)
    expect((await json(response)).code).toBe("WORKSPACE_BLOCKED")
    expect(mocks.recordRequest).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test.each([
    ["inactive", { ...WEBHOOK, active: false }],
    ["without a configured inbox", { ...WEBHOOK, isConfigured: false }],
  ])("a webhook %s is 403", async (_name, webhook) => {
    mocks.findByToken.mockResolvedValue(webhook)

    const response = await post()

    expect(response.status).toBe(403)
    expect((await json(response)).code).toBe("WEBHOOK_INACTIVE")
    expect(mocks.recordRequest).not.toHaveBeenCalled()
  })

  test.each([
    ["not JSON", "not json"],
    ["a JSON string", '"text"'],
    ["a JSON number", "5"],
    ["JSON null", "null"],
    ["empty", ""],
    ["a NUL in a string", '{"a":"\\u0000"}'],
    ["a NUL in a key", '{"\\u0000":1}'],
    ["a lone surrogate", '{"a":"\\ud800"}'],
    ["nested deeper than the limit", `${"[".repeat(65)}${"]".repeat(65)}`],
  ])("a body that is %s is 400", async (_name, body) => {
    const response = await post(body)

    expect(response.status).toBe(400)
    expect((await json(response)).code).toBe("INVALID_JSON")
    expect(mocks.recordRequest).not.toHaveBeenCalled()
  })

  test("an over-long Idempotency-Key is 400", async () => {
    const response = await post('{"a":1}', {
      "Idempotency-Key": "k".repeat(256),
    })

    expect(response.status).toBe(400)
    expect((await json(response)).code).toBe("INVALID_IDEMPOTENCY_KEY")
    expect(mocks.recordRequest).not.toHaveBeenCalled()
  })
})

describe("body size", () => {
  test("a body declared larger than 256 KiB is 413 before it is read or looked up", async () => {
    const response = await post('{"a":1}', {
      "content-length": String(256 * 1024 + 1),
    })

    expect(response.status).toBe(413)
    expect((await json(response)).code).toBe("PAYLOAD_TOO_LARGE")
    expect(mocks.findByToken).not.toHaveBeenCalled()
  })

  test("a streamed body that grows past the cap is 413", async () => {
    const big = JSON.stringify({ blob: "x".repeat(256 * 1024) })

    const response = await post(big)

    expect(response.status).toBe(413)
    expect(mocks.recordRequest).not.toHaveBeenCalled()
  })

  test("a body just under the cap is stored whole", async () => {
    const body = JSON.stringify({ blob: "x".repeat(200 * 1024), last: "end" })

    const response = await post(body)

    expect(response.status).toBe(202)
    expect(mocks.recordRequest.mock.calls[0]?.[0].payload.last).toBe("end")
  })
})

describe("rate limiting", () => {
  test("is checked per IP before the token is looked up", async () => {
    await post()

    expect(mocks.checkApiRateLimit.mock.calls[0]?.[0]).toEqual({
      scope: "inbound-webhook-preauth-rate-limit",
      key: "1.2.3.4",
      limit: 300,
    })
    const preauthOrder =
      mocks.checkApiRateLimit.mock.invocationCallOrder[0] ?? 0
    expect(preauthOrder).toBeLessThan(
      mocks.findByToken.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("callers with no client IP share a coarser, higher bucket instead of none", async () => {
    mocks.getGuestClientIp.mockReturnValue("unknown")

    await post()

    expect(mocks.checkApiRateLimit.mock.calls[0]?.[0]).toEqual({
      scope: "inbound-webhook-preauth-rate-limit",
      key: "unknown",
      limit: 1500,
    })
  })

  test("then per webhook, 600 per window", async () => {
    await post()

    expect(mocks.checkApiRateLimit.mock.calls[1]?.[0]).toEqual({
      scope: "inbound-webhook-rate-limit",
      key: "w-1",
      limit: 600,
    })
  })

  test.each([
    ["the per-IP", 0],
    ["the per-webhook", 1],
  ])("%s limit answers 429 with Retry-After and stores nothing", async (_name, hit) => {
    mocks.checkApiRateLimit.mockImplementation(
      (() => {
        let call = -1
        return () => {
          call += 1
          return Promise.resolve({ limited: call === hit, retryAfter: 7 })
        }
      })(),
    )

    const response = await post()

    expect(response.status).toBe(429)
    expect((await json(response)).code).toBe("RATE_LIMITED")
    expect(response.headers.get("retry-after")).toBe("7")
    expect(mocks.recordRequest).not.toHaveBeenCalled()
  })
})

describe("method handling and failures", () => {
  test.each([
    "GET",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ] as const)("%s is 405 with an Allow header", (method) => {
    const response = route[method]()

    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("POST")
  })

  test("an unexpected error is a retryable 500 that logs neither the token nor the body", async () => {
    mocks.findByToken.mockRejectedValue(new Error("db down"))

    const response = await post()

    expect(response.status).toBe(500)
    expect(await json(response)).toEqual({
      accepted: false,
      code: "SYSTEM_ERROR",
      message: "Please retry",
    })
    const logged = JSON.stringify(mocks.loggerError.mock.calls)
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain('"a":1')
  })

  // Errors serialise to `{}` with JSON.stringify; spell out what the logger's
  // `err` serializer would print (message, stack, own properties).
  const loggedErrorText = () =>
    JSON.stringify(mocks.loggerError.mock.calls, (_key, value: unknown) =>
      value instanceof Error
        ? { ...value, message: value.message, stack: value.stack }
        : value,
    )

  test("a database error never puts its bound values (token, key, payload) in the log", async () => {
    const dbError = new DrizzleQueryError(
      "insert into InboundWebhookRequest (payload) values ($1)",
      [TOKEN, '{"a":1}', "key-1"],
      Object.assign(new Error("boom"), { code: "57P01" }),
    )
    mocks.recordRequest.mockRejectedValue(dbError)

    const response = await post()

    expect(response.status).toBe(500)
    const logged = loggedErrorText()
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain("key-1")
    expect(logged).not.toContain('"a":1')
    expect(logged).toContain("57P01")
  })

  test("a database error whose cause has no code is still reduced to a generic message", async () => {
    mocks.recordRequest.mockRejectedValue(
      new DrizzleQueryError(
        "insert ...",
        [TOKEN, "key-1"],
        new Error("socket closed"),
      ),
    )

    await post()

    const logged = loggedErrorText()
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain("key-1")
    expect(logged).not.toContain("socket closed")
    expect(logged).toContain("Database error")
  })

  test("never logs the token on the warning path either", async () => {
    mocks.enqueue.mockRejectedValue(new Error("redis down"))

    await post()

    expect(JSON.stringify(mocks.loggerWarn.mock.calls)).not.toContain(TOKEN)
  })
})

describe("error codes", () => {
  test("are UPPER_SNAKE_CASE and unique, defined in one place", async () => {
    const { INBOUND_WEBHOOK_ERROR_CODE } = await import(
      "../src/features/inbound-webhooks/lib/error-codes"
    )
    const codes = Object.values(INBOUND_WEBHOOK_ERROR_CODE)

    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) {
      expect(code).toMatch(UPPER_SNAKE_CASE)
    }
  })
})
