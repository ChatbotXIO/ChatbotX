import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@chatbotx.io/business", () => ({
  telegramIntegrationService: {},
}))
vi.mock("@chatbotx.io/integration-telegram", () => ({
  registerWebhook: vi.fn(),
  isRevokedTokenError: vi.fn(),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { reregisterTelegramWebhooks, toWebhookBot } = await import(
  "../scripts/reregister-telegram-webhooks"
)
type Deps = import("../scripts/reregister-telegram-webhooks").ReregisterDeps
type Bot = import("../scripts/reregister-telegram-webhooks").TelegramWebhookBot

const bot = (id: number, secret?: string): Bot => ({
  id: String(id),
  workspaceId: "ws-1",
  botId: `bot-${id}`,
  botToken: `token-${id}`,
  ...(secret ? { webhookSecretToken: secret } : {}),
})

class RevokedError extends Error {}

describe("reregisterTelegramWebhooks", () => {
  const registerWebhook = vi.fn<Deps["registerWebhook"]>()
  const saveSecretToken = vi.fn<Deps["saveSecretToken"]>()
  const order: string[] = []

  const depsFor = (bots: Bot[]): Deps => ({
    listPage: ({ afterId }) => Promise.resolve(afterId ? [] : bots),
    createSecretToken: () => "fresh-secret",
    webhookUrlFor: (botId) => `https://app.test/hook?botId=${botId}`,
    registerWebhook,
    saveSecretToken,
    isRevokedToken: (error) => error instanceof RevokedError,
  })

  beforeEach(() => {
    order.length = 0
    registerWebhook.mockReset().mockImplementation(() => {
      order.push("register")
      return Promise.resolve()
    })
    saveSecretToken.mockReset().mockImplementation(() => {
      order.push("save")
      return Promise.resolve(true)
    })
  })

  it("gives a bot without a secret a new one, registering before saving", async () => {
    const summary = await reregisterTelegramWebhooks(depsFor([bot(1)]))

    expect(registerWebhook).toHaveBeenCalledWith({
      botToken: "token-1",
      webhookUrl: "https://app.test/hook?botId=bot-1",
      secretToken: "fresh-secret",
    })
    expect(saveSecretToken).toHaveBeenCalledWith({
      id: "1",
      webhookSecretToken: "fresh-secret",
    })
    expect(order).toEqual(["register", "save"])
    expect(summary).toEqual({
      total: 1,
      registered: 1,
      secretsAdded: 1,
      revoked: 0,
      failed: 0,
    })
  })

  it("keeps the secret a bot already has", async () => {
    const summary = await reregisterTelegramWebhooks(
      depsFor([bot(2, "kept-secret")]),
    )

    expect(registerWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ secretToken: "kept-secret" }),
    )
    expect(saveSecretToken).not.toHaveBeenCalled()
    expect(summary.registered).toBe(1)
    expect(summary.secretsAdded).toBe(0)
  })

  it("skips a revoked token without failing the run", async () => {
    registerWebhook.mockRejectedValueOnce(new RevokedError("401"))
    const summary = await reregisterTelegramWebhooks(
      depsFor([bot(3), bot(4, "s")]),
    )

    expect(saveSecretToken).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "3" }),
    )
    expect(summary).toEqual({
      total: 2,
      registered: 1,
      secretsAdded: 0,
      revoked: 1,
      failed: 0,
    })
  })

  it("counts other errors as failures and does not save a secret", async () => {
    registerWebhook.mockRejectedValueOnce(new Error("network"))
    const summary = await reregisterTelegramWebhooks(depsFor([bot(5)]))

    expect(saveSecretToken).not.toHaveBeenCalled()
    expect(summary.failed).toBe(1)
  })

  it("fails a bot that got a secret meanwhile, so a re-run fixes it", async () => {
    saveSecretToken.mockResolvedValueOnce(false)
    const summary = await reregisterTelegramWebhooks(depsFor([bot(6)]))

    expect(summary.failed).toBe(1)
    expect(summary.secretsAdded).toBe(0)
  })
})

describe("toWebhookBot", () => {
  const row = (auth: Record<string, unknown>) => ({
    id: "1",
    workspaceId: "ws-1",
    botId: "bot-1",
    auth,
  })

  it("reads the token and the secret", () => {
    expect(
      toWebhookBot(
        row({ secretText: "t", metadata: { webhookSecretToken: "s" } }),
      ),
    ).toEqual({
      id: "1",
      workspaceId: "ws-1",
      botId: "bot-1",
      botToken: "t",
      webhookSecretToken: "s",
    })
  })

  it("treats a missing secret as none", () => {
    expect(toWebhookBot(row({ secretText: "t" }))).not.toHaveProperty(
      "webhookSecretToken",
    )
  })

  it("rejects a row without a bot token", () => {
    expect(toWebhookBot(row({}))).toBeNull()
  })
})
