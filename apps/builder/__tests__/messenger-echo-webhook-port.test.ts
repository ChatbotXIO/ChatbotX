// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  echoClearFlag: vi.fn(),
  echoPush: vi.fn(),
  echoSchedule: vi.fn(),
  env: {
    MESSENGER_ECHO_COLLECTOR_ENABLED: true,
    MESSENGER_ECHO_FLAG_TTL_MS: 60_000,
    MESSENGER_ECHO_FLUSH_DELAY_MS: 500,
    MESSENGER_ECHO_LIST_MAX_BYTES: 4 * 1024 * 1024,
    MESSENGER_ECHO_LIST_MAX_ITEMS: 5000,
    MESSENGER_ECHO_LIST_TTL_SECONDS: 6 * 60 * 60,
  },
  findCredential: vi.fn(),
  handleRequest: vi.fn(),
  lowAdd: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { findActiveByDomain: vi.fn() },
  platformCredentialService: {
    findDecryptedForUser: vi.fn(),
    findDecryptedPlatform: mocks.findCredential,
  },
  tenantService: { findById: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: vi.fn() },
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  inboxStatuses: { enum: { disconnected: "disconnected" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({ inboxModel: {} }))

vi.mock("@chatbotx.io/worker-config/messenger-echo", () => ({
  echoCollector: {
    clearFlag: mocks.echoClearFlag,
    push: mocks.echoPush,
    schedule: mocks.echoSchedule,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  integrationQueue: { name: "integration" },
  LowJobAction: { messengerEchoFlush: "messengerEchoFlush" },
  lowQueue: { add: mocks.lowAdd },
}))

vi.mock("@/env", () => ({
  env: mocks.env,
  isCloud: vi.fn(() => false),
}))

vi.mock("@/features/integration-telegram/queries", () => ({
  findIntegrationTelegramByBotId: vi.fn(),
}))

vi.mock("@/features/integration-tiktok/queries", () => ({
  findIntegrationTiktokByOpenId: vi.fn(),
}))

vi.mock("@/integration", () => ({
  integrations: {
    messenger: { name: "messenger", handleRequest: mocks.handleRequest },
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), error: mocks.loggerError, info: vi.fn() },
}))

vi.mock("@/lib/oauth-broker", () => ({ isBrokerHost: () => false }))
vi.mock("@/lib/webhook-log", () => ({ logWebhookRequestBody: vi.fn() }))

const { handleWebhook } = await import(
  "../src/app/integrations/[...integration]/webhook"
)

const request = () => {
  const req = new Request("http://localhost/integrations/messenger/webhook", {
    method: "POST",
    body: "{}",
  })
  return Object.assign(req, { nextUrl: new URL(req.url) }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.MESSENGER_ECHO_COLLECTOR_ENABLED = true
  mocks.findCredential.mockResolvedValue({ config: { clientSecret: "secret" } })
  mocks.handleRequest.mockResolvedValue("ok")
  mocks.echoPush.mockResolvedValue({ accepted: true, size: 1, bytes: 100 })
  mocks.echoClearFlag.mockResolvedValue(undefined)
  mocks.echoSchedule.mockResolvedValue(true)
  mocks.lowAdd.mockResolvedValue(undefined)
})

describe("Messenger echo collector webhook port", () => {
  test("maps pushes and schedules a delayed low job without a fixed jobId", async () => {
    mocks.handleRequest.mockImplementationOnce(async ({ echoCollector }) => {
      const pushResult = await echoCollector.push({
        channel: "messenger",
        identifier: "page-1",
        item: { mid: "mid-1" },
      })
      await echoCollector.schedule({
        channel: "messenger",
        identifier: "page-1",
      })
      expect(pushResult).toEqual({ accepted: true, size: 1, bytes: 100 })
      return "ok"
    })

    await handleWebhook("messenger", request())

    expect(mocks.echoPush).toHaveBeenCalledExactlyOnceWith(
      { channel: "messenger", identifier: "page-1" },
      { mid: "mid-1" },
      {
        maxItems: 5000,
        maxBytes: 4 * 1024 * 1024,
        ttlSeconds: 6 * 60 * 60,
      },
    )
    expect(mocks.echoSchedule).toHaveBeenCalledExactlyOnceWith(
      { channel: "messenger", identifier: "page-1" },
      60_000,
    )
    expect(mocks.lowAdd).toHaveBeenCalledExactlyOnceWith(
      "messengerEchoFlush",
      {
        type: "messengerEchoFlush",
        data: {
          channel: "messenger",
          integrationIdentifier: "page-1",
        },
      },
      { delay: 500 },
    )
    expect(mocks.lowAdd.mock.calls[0]?.[2]).not.toHaveProperty("jobId")
  })

  test("does not add a low job when another webhook already owns the flag", async () => {
    mocks.echoSchedule.mockResolvedValue(false)
    mocks.handleRequest.mockImplementationOnce(async ({ echoCollector }) => {
      await echoCollector.schedule({
        channel: "messenger",
        identifier: "page-1",
      })
      return "ok"
    })

    await handleWebhook("messenger", request())

    expect(mocks.lowAdd).not.toHaveBeenCalled()
  })

  test("clears the scheduling flag before an enqueue error reaches the webhook fallback", async () => {
    const enqueueError = new Error("queue unavailable")
    mocks.lowAdd.mockRejectedValueOnce(enqueueError)
    mocks.handleRequest.mockImplementationOnce(async ({ echoCollector }) => {
      await echoCollector.schedule({
        channel: "messenger",
        identifier: "page-1",
      })
      return "ok"
    })

    const response = await handleWebhook("messenger", request())

    expect(mocks.echoClearFlag).toHaveBeenCalledExactlyOnceWith({
      channel: "messenger",
      identifier: "page-1",
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      message: "queue unavailable",
    })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: enqueueError, integrationType: "messenger" },
      "Integration handleRequest failed",
    )
  })

  test("passes no collector port when the feature flag is off", async () => {
    mocks.env.MESSENGER_ECHO_COLLECTOR_ENABLED = false

    await handleWebhook("messenger", request())

    expect(mocks.handleRequest).toHaveBeenCalledWith(
      expect.not.objectContaining({ echoCollector: expect.anything() }),
    )
    expect(mocks.echoPush).not.toHaveBeenCalled()
    expect(mocks.echoSchedule).not.toHaveBeenCalled()
    expect(mocks.lowAdd).not.toHaveBeenCalled()
  })
})
