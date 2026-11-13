// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest"

const findByInboundToken = vi.fn()
const handleRequest = vi.fn()
const queue = { add: vi.fn() }

vi.mock("@chatbotx.io/business", () => ({
  integrationSmtpService: { findByInboundToken },
}))
vi.mock("@chatbotx.io/integration-smtp", () => ({
  isInboundWebhookProvider: (provider: string) =>
    ["sendgrid", "mailgun", "postmark", "brevo"].includes(provider),
}))
vi.mock("@chatbotx.io/sdk", () => ({
  SdkException: class SdkException extends Error {
    httpStatusCode = 400
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({ integrationQueue: queue }))
vi.mock("@/integration", () => ({ integrations: { smtp: { handleRequest } } }))
vi.mock("@/lib/log", () => ({ logger: { warn: vi.fn() } }))

const { SdkException } = await import("@chatbotx.io/sdk")
const { POST } = await import(
  "../src/app/integrations/smtp/webhook/[token]/route"
)

const call = (token: string) =>
  POST(
    new Request("https://app.test/hook", {
      method: "POST",
      body: "x",
    }) as never,
    { params: Promise.resolve({ token }) },
  )

beforeEach(() => {
  vi.clearAllMocks()
})

test("an unknown token is a 404 and nothing is processed", async () => {
  findByInboundToken.mockResolvedValue(undefined)

  const response = await call("nope")

  expect(response.status).toBe(404)
  expect(handleRequest).not.toHaveBeenCalled()
})

test("a mailbox-provider inbox cannot be fed through the webhook", async () => {
  findByInboundToken.mockResolvedValue({
    inboxId: "inbox-1",
    auth: { provider: "google" },
  })

  const response = await call("tok")

  expect(response.status).toBe(400)
  expect(handleRequest).not.toHaveBeenCalled()
})

test("a valid token hands the request to the integration for that inbox", async () => {
  findByInboundToken.mockResolvedValue({
    inboxId: "inbox-1",
    auth: { provider: "postmark" },
  })
  handleRequest.mockResolvedValue("ok")

  const response = await call("tok")

  expect(response.status).toBe(200)
  expect(await response.text()).toBe("ok")
  expect(handleRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      config: { inboxId: "inbox-1", provider: "postmark" },
      queue,
    }),
  )
})

test("a rejected payload surfaces the exception's status", async () => {
  findByInboundToken.mockResolvedValue({
    inboxId: "inbox-1",
    auth: { provider: "brevo" },
  })
  const error = new SdkException("too big")
  error.httpStatusCode = 413
  handleRequest.mockRejectedValue(error)

  const response = await call("tok")

  expect(response.status).toBe(413)
})
