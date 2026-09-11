// @vitest-environment node

import { afterAll, describe, expect, test, vi } from "vitest"

const loggerInfo = vi.fn()
const loggerDebug = vi.fn()

vi.mock("@/lib/log", () => ({
  logger: {
    debug: loggerDebug,
    error: vi.fn(),
    info: loggerInfo,
    // The real production logger is a pino child, so `isLevelEnabled` exists at
    // runtime. Without it here the diagnostic path would throw and be swallowed
    // by `logWebhookRequestBody`'s catch, hiding a broken call site.
    isLevelEnabled: vi.fn(() => true),
  },
}))

// Pin LOG_DEBUG before loading the module: `@chatbotx.io/logger` resolves its
// diagnostic level once at import time, so a shell-exported LOG_DEBUG=true would
// otherwise make `logDiagnostic` emit at info and flip this suite's assertions.
vi.stubEnv("LOG_DEBUG", "")

const { logWebhookRequestBody, sanitizeWebhookBody } = await import(
  "../src/lib/webhook-log"
)

afterAll(() => {
  vi.unstubAllEnvs()
})

// Redaction and capping themselves are covered generically in
// `packages/logger/__tests__/redact.test.ts`. These tests cover only the
// webhook-specific glue: parsing a raw body string and the fail-closed
// omission of anything that cannot be safely redacted.
describe("sanitizeWebhookBody", () => {
  test("redacts secrets end-to-end for a parseable JSON body", () => {
    const body = JSON.stringify({
      access_token: "abc123",
      user: { token: "nested-secret", name: "alice" },
    })

    const result = JSON.parse(sanitizeWebhookBody(body))

    expect(result.access_token).toBe("[redacted]")
    expect(result.user.token).toBe("[redacted]")
    expect(result.user.name).toBe("alice")
  })

  test("omits a non-JSON body instead of logging it raw", () => {
    const body = "access_token=super-secret&foo=bar"

    const result = sanitizeWebhookBody(body)

    expect(result).not.toContain("super-secret")
    expect(result).toContain("[body omitted for safety")
  })

  test("omits an oversized body instead of parsing or logging it raw", () => {
    const hugeValue = "a".repeat(70_000)
    const body = JSON.stringify({ access_token: hugeValue })

    const result = sanitizeWebhookBody(body)

    // Parsing is skipped AND the raw body is not emitted — no secret leak.
    expect(result).not.toContain(hugeValue)
    expect(result).toContain("[body omitted for safety: too large to redact")
  })

  test("redacts a body exactly at the parse limit but omits one char over it", () => {
    // For an all-"a" value the JSON is `{"v":"<value>"}` = value.length + 8.
    const wrapperLength = `{"v":""}`.length

    const atLimitBody = JSON.stringify({
      v: "a".repeat(65_536 - wrapperLength),
    })
    expect(atLimitBody.length).toBe(65_536)
    expect(sanitizeWebhookBody(atLimitBody)).not.toContain("[body omitted")

    const overLimitBody = JSON.stringify({
      v: "a".repeat(65_537 - wrapperLength),
    })
    expect(overLimitBody.length).toBe(65_537)
    expect(sanitizeWebhookBody(overLimitBody)).toContain(
      "[body omitted for safety: too large to redact",
    )
  })

  test("leaves a small parseable body intact", () => {
    const body = JSON.stringify({ ok: true })

    expect(sanitizeWebhookBody(body)).toBe(JSON.stringify({ ok: true }))
  })
})

describe("logWebhookRequestBody", () => {
  test("never throws when reading the cloned request body rejects", async () => {
    loggerInfo.mockClear()
    const req = {
      clone: () => ({
        text: () => Promise.reject(new Error("stream errored")),
      }),
    } as unknown as Parameters<typeof logWebhookRequestBody>[1]

    await expect(
      logWebhookRequestBody("telegram", req),
    ).resolves.toBeUndefined()

    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ integrationType: "telegram" }),
      "Failed to read webhook request body for logging",
    )
  })

  test("logs the metadata line and the sanitized diagnostic payload", async () => {
    loggerInfo.mockClear()
    loggerDebug.mockClear()
    const rawBody = JSON.stringify({ ok: true, token: "secret" })
    const req = {
      clone: () => ({ text: () => Promise.resolve(rawBody) }),
    } as unknown as Parameters<typeof logWebhookRequestBody>[1]

    await logWebhookRequestBody("messenger", req)

    // Metadata line only — original, uncapped content length; no failure line.
    expect(loggerInfo).toHaveBeenCalledTimes(1)
    expect(loggerInfo).toHaveBeenCalledWith(
      { integrationType: "messenger", contentLength: rawBody.length },
      "Webhook request body",
    )
    // Diagnostic payload actually emitted, with the body sanitized (redacted).
    expect(loggerDebug).toHaveBeenCalledWith(
      { integrationType: "messenger", body: sanitizeWebhookBody(rawBody) },
      "Webhook request body payload",
    )
  })
})
