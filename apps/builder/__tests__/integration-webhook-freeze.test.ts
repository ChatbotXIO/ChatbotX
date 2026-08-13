// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const getAccessState = vi.fn()
const workspaceFind = vi.fn()
const findIntegrationTelegramByBotId = vi.fn()
const findIntegrationTiktokByOpenId = vi.fn()
const telegramHandleRequest = vi.fn()
const tiktokHandleRequest = vi.fn()
const loggerInfo = vi.fn()

vi.mock("@chatbotx.io/business", async () => {
  const { resolveWorkspaceFreezeReason } = await import(
    "@chatbotx.io/business/workspace-lifecycle/predicates"
  )
  return {
    customDomainService: { findActiveByDomain: vi.fn() },
    platformCredentialService: {
      findDecryptedPlatform: vi.fn(),
      findDecryptedForUser: vi.fn(),
    },
    resolveWorkspaceFreezeReason,
    tenantService: { findById: vi.fn() },
    userQuotaService: { getAccessState },
    workspaceService: { find: workspaceFind },
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { update: vi.fn() },
  eq: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  inboxStatuses: { enum: { disconnected: "disconnected" } },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: {},
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  integrationQueue: {},
}))

const isCloud = vi.fn(() => false)
vi.mock("@/env", () => ({
  isCloud,
}))

vi.mock("@/features/integration-telegram/queries", () => ({
  findIntegrationTelegramByBotId,
}))

vi.mock("@/features/integration-tiktok/queries", () => ({
  findIntegrationTiktokByOpenId,
}))

vi.mock("@/integration", () => ({
  integrations: {
    telegram: { name: "telegram", handleRequest: telegramHandleRequest },
    tiktok: { name: "tiktok", handleRequest: tiktokHandleRequest },
  },
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: loggerInfo },
}))

vi.mock("@/lib/oauth-broker", () => ({
  isBrokerHost: () => false,
}))

const { handleWebhook } = await import(
  "../src/app/integrations/[...integration]/webhook"
)

const asNextRequest = (url: string, body?: string) => {
  const request = new Request(url, body ? { method: "POST", body } : undefined)
  return Object.assign(request, { nextUrl: new URL(url) }) as never
}

const liveWorkspace = {
  id: "workspace-1",
  ownerId: "owner-1",
  scheduledDeletionAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  isCloud.mockReturnValue(false)
  getAccessState.mockResolvedValue({ blocked: false })
  workspaceFind.mockResolvedValue(liveWorkspace)
  telegramHandleRequest.mockResolvedValue("ok")
  tiktokHandleRequest.mockResolvedValue("ok")
  findIntegrationTelegramByBotId.mockResolvedValue({
    auth: { secretText: "secret", metadata: { webhookSecretToken: "token" } },
    botId: "bot-1",
    workspaceId: "workspace-1",
  })
  findIntegrationTiktokByOpenId.mockResolvedValue({
    auth: { clientId: "id", clientSecret: "secret", redirectUrl: "https://x" },
    inboxId: "inbox-1",
    openId: "open-1",
    workspaceId: "workspace-1",
  })
})

describe("telegram webhook freeze", () => {
  const request = () =>
    asNextRequest("http://localhost/integrations/telegram?botId=bot-1")

  test("forwards the update to the integration for a live workspace", async () => {
    await handleWebhook("telegram", request())

    expect(telegramHandleRequest).toHaveBeenCalledOnce()
  })

  test("skips the update when the workspace is scheduled for deletion", async () => {
    workspaceFind.mockResolvedValue({
      ...liveWorkspace,
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    })

    const response = await handleWebhook("telegram", request())

    expect(await response.text()).toBe("ok")
    expect(telegramHandleRequest).not.toHaveBeenCalled()
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ freezeReason: "scheduledForDeletion" }),
      "webhook skipped: frozen workspace",
    )
  })

  test("skips the update when the owner entitlement is blocked on cloud", async () => {
    isCloud.mockReturnValue(true)
    getAccessState.mockResolvedValue({ blocked: true })

    const response = await handleWebhook("telegram", request())

    expect(await response.text()).toBe("ok")
    expect(telegramHandleRequest).not.toHaveBeenCalled()
  })

  test("off cloud, never consults owner entitlements (mirrors withBlockedOwnerGuard)", async () => {
    isCloud.mockReturnValue(false)
    getAccessState.mockResolvedValue({ blocked: true })

    await handleWebhook("telegram", request())

    expect(telegramHandleRequest).toHaveBeenCalledOnce()
    expect(getAccessState).not.toHaveBeenCalled()
  })

  test("skips the update when the workspace row no longer exists", async () => {
    workspaceFind.mockResolvedValue(undefined)

    const response = await handleWebhook("telegram", request())

    expect(await response.text()).toBe("ok")
    expect(telegramHandleRequest).not.toHaveBeenCalled()
  })
})

describe("tiktok webhook freeze", () => {
  const request = () =>
    asNextRequest(
      "http://localhost/integrations/tiktok",
      JSON.stringify({ user_openid: "open-1", event: "comment" }),
    )

  test("forwards the event to the integration for a live workspace", async () => {
    await handleWebhook("tiktok", request())

    expect(tiktokHandleRequest).toHaveBeenCalledOnce()
  })

  test("skips the event when the workspace is scheduled for deletion", async () => {
    workspaceFind.mockResolvedValue({
      ...liveWorkspace,
      scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"),
    })

    const response = await handleWebhook("tiktok", request())

    expect(await response.text()).toBe("ok")
    expect(tiktokHandleRequest).not.toHaveBeenCalled()
  })

  test("skips the event when the workspace row no longer exists", async () => {
    workspaceFind.mockResolvedValue(undefined)

    const response = await handleWebhook("tiktok", request())

    expect(await response.text()).toBe("ok")
    expect(tiktokHandleRequest).not.toHaveBeenCalled()
  })
})
