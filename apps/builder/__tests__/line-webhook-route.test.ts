// @vitest-environment node

import { SdkException } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findByChannelId = vi.fn()
const lineHandleRequest = vi.fn()
const loggerError = vi.fn()
const loggerWarn = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: {
    markUnhealthyByIdentifier: vi.fn(),
    markLegacyInboxUnhealthy: vi.fn(),
  },
  customDomainService: { findActiveByDomain: vi.fn() },
  lineIntegrationService: { findByChannelId },
  platformCredentialService: {
    findDecryptedForUser: vi.fn(),
    findDecryptedForWebhook: vi.fn(),
    findDecryptedPlatform: vi.fn(),
  },
  tenantService: { findById: vi.fn() },
  workspaceMemberService: { findOwnerUserIdByWorkspaceId: vi.fn() },
}))

vi.mock("@chatbotx.io/channel-registry/registry", () => ({
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { providerAccountEvent: "providerAccountEvent" },
  integrationQueue: { add: vi.fn() },
}))

vi.mock("@/env", () => ({ isCloud: () => false }))

vi.mock("@/features/integration-telegram/queries", () => ({
  findIntegrationTelegramByBotId: vi.fn(),
}))

vi.mock("@/features/integration-tiktok/queries", () => ({
  findIntegrationTiktokByOpenId: vi.fn(),
}))

vi.mock("@/integration", () => ({
  integrations: {
    line: { name: "line", handleRequest: lineHandleRequest },
  },
}))

vi.mock("@/lib/log", () => ({
  logger: {
    debug: vi.fn(),
    error: loggerError,
    info: vi.fn(),
    warn: loggerWarn,
  },
}))

vi.mock("@/lib/oauth-broker", () => ({ isBrokerHost: () => false }))

// Loaded after every `vi.mock` above has registered.
const { handleWebhook } = await import(
  "../src/app/integrations/[...integration]/webhook"
)

const RAW_BODY = '{"destination":"Ubot","events":[]}'

const asNextRequest = (url: string, body?: string) => {
  const request = new Request(
    url,
    body
      ? {
          method: "POST",
          body,
          headers: { "x-line-signature": "sig" },
        }
      : undefined,
  )
  return Object.assign(request, { nextUrl: new URL(url) }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  lineHandleRequest.mockResolvedValue("OK")
})

describe("LINE webhook routing", () => {
  test("400s when the channelId query param is missing", async () => {
    const response = await handleWebhook(
      "line",
      asNextRequest("http://localhost/integrations/line/webhook", RAW_BODY),
    )

    expect(response.status).toBe(400)
    expect(findByChannelId).not.toHaveBeenCalled()
    expect(lineHandleRequest).not.toHaveBeenCalled()
  })

  test("acks (200 OK) and drops events for an unknown channelId", async () => {
    findByChannelId.mockResolvedValue(null)

    const response = await handleWebhook(
      "line",
      asNextRequest(
        "http://localhost/integrations/line/webhook?channelId=ch-unknown",
        RAW_BODY,
      ),
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("OK")
    expect(findByChannelId).toHaveBeenCalledWith("ch-unknown")
    expect(lineHandleRequest).not.toHaveBeenCalled()
  })

  test("forwards channelId, the row's channel secret and botUserId as config with the unread request", async () => {
    findByChannelId.mockResolvedValue({
      channelId: "ch-1",
      botUserId: "Ubot",
      auth: { clientId: "ch-1", clientSecret: "row-secret" },
    })
    lineHandleRequest.mockImplementation(async ({ req }: { req: Request }) => {
      // The handler verifies the HMAC over the raw body, so the route
      // must hand it an unconsumed request.
      expect(req.bodyUsed).toBe(false)
      expect(await req.text()).toBe(RAW_BODY)
      return "OK"
    })

    const response = await handleWebhook(
      "line",
      asNextRequest(
        "http://localhost/integrations/line/webhook?channelId=ch-1",
        RAW_BODY,
      ),
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("OK")
    expect(lineHandleRequest).toHaveBeenCalledTimes(1)
    expect(lineHandleRequest.mock.calls[0]?.[0]).toMatchObject({
      config: {
        channelId: "ch-1",
        channelSecret: "row-secret",
        botUserId: "Ubot",
      },
    })
  })

  const knownChannel = () =>
    findByChannelId.mockResolvedValue({
      channelId: "ch-1",
      botUserId: "Ubot",
      auth: { clientId: "ch-1", clientSecret: "row-secret" },
    })

  const post = () =>
    handleWebhook(
      "line",
      asNextRequest(
        "http://localhost/integrations/line/webhook?channelId=ch-1",
        RAW_BODY,
      ),
    )

  test.each([
    ["a bad signature", 401, "Invalid webhook signature"],
    ["a wrong destination", 400, "Webhook destination does not match this bot"],
    ["an unreadable body", 400, "Webhook body is not JSON"],
  ])("answers the handler's own rejection (%s) with its status", async (_label, status, message) => {
    knownChannel()
    lineHandleRequest.mockRejectedValue(
      new SdkException(message, "lineError", status),
    )

    const response = await post()

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ message })
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ integrationType: "line", status }),
      expect.any(String),
    )
    expect(loggerError).not.toHaveBeenCalled()
  })

  test("a server-side failure (e.g. the queue is down) is a 500 so LINE redelivers", async () => {
    knownChannel()
    lineHandleRequest.mockRejectedValue(new Error("connect ECONNREFUSED redis"))

    const response = await post()

    expect(response.status).toBe(500)
    // Internal detail never reaches the caller.
    expect(await response.json()).toEqual({ message: "Internal error" })
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ integrationType: "line", status: 500 }),
      expect.any(String),
    )
  })

  test("an SdkException carrying a 5xx stays a 500", async () => {
    knownChannel()
    lineHandleRequest.mockRejectedValue(
      new SdkException("upstream down", "lineError", 503),
    )

    const response = await post()

    expect(response.status).toBe(500)
  })
})
